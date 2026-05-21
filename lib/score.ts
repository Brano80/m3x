import Anthropic from '@anthropic-ai/sdk'
import { SupabaseClient } from '@supabase/supabase-js'
import { geminiStructured } from './gemini'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const CACHE_TTL_DAYS = 7

export interface ScoreResult {
  final_score: number
  intent_score: number
  complementarity_score: number
  capability_score: number
  activity_score: number
  diversity_boost: number
  tier: 'strong_match' | 'match' | 'near_match' | null
  reasoning: string
}

// Canonical pair key: always smaller UUID first to avoid duplicate cache entries
function pairKey(idA: string, idB: string): [string, string] {
  return idA < idB ? [idA, idB] : [idB, idA]
}

async function getCachedScore(
  supabase: SupabaseClient,
  intentAId: string,
  intentBId: string
): Promise<ScoreResult | null> {
  const [a, b] = pairKey(intentAId, intentBId)
  const { data } = await supabase
    .from('score_cache')
    .select('score, tier, score_details, expires_at')
    .eq('intent_a_id', a)
    .eq('intent_b_id', b)
    .maybeSingle()

  if (!data) return null
  if (new Date(data.expires_at) < new Date()) return null // expired

  return { ...(data.score_details as any), final_score: data.score, tier: data.tier }
}

async function setCachedScore(
  supabase: SupabaseClient,
  intentAId: string,
  intentBId: string,
  result: ScoreResult
): Promise<void> {
  const [a, b] = pairKey(intentAId, intentBId)
  const expires_at = new Date(Date.now() + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()

  await supabase.from('score_cache').upsert({
    intent_a_id: a,
    intent_b_id: b,
    score: result.final_score,
    tier: result.tier,
    score_details: result,
    expires_at,
  }, { onConflict: 'intent_a_id,intent_b_id' })
}

// byok: agent's own key — used instead of infra key when provided
export async function scorePair(
  intentA: any,
  intentB: any,
  agentA: any,
  agentB: any,
  supabase?: SupabaseClient,
  byok?: { provider: string; key: string }
): Promise<ScoreResult | null> {
  try {
    // Check cache first — skips Haiku call if pair was scored in last 7 days
    if (supabase) {
      const cached = await getCachedScore(supabase, intentA.id, intentB.id)
      if (cached) {
        console.log(`[score] cache hit: ${intentA.id} × ${intentB.id}`)
        return cached
      }
    }

    const prompt = `You are the M3X matching engine. Score this agent intent pair.

INTENT A (${intentA.side}):
Market: ${intentA.market} | Type: ${intentA.intent_type}
Packet: ${JSON.stringify(intentA.raw_packet)}
Agent trust: ${agentA.trust_score} | Capabilities: ${JSON.stringify(agentA.capabilities)}

INTENT B (${intentB.side}):
Market: ${intentB.market} | Type: ${intentB.intent_type}
Packet: ${JSON.stringify(intentB.raw_packet)}
Agent trust: ${agentB.trust_score} | Capabilities: ${JSON.stringify(agentB.capabilities)}

Score each dimension 0.0–1.0:
- intent_score: demand↔supply alignment
- complementarity_score: do they fill each other's gaps (buyer↔seller, builder↔marketer)?
- capability_score: semantic capability overlap
- activity_score: default 0.5 unless signals suggest otherwise
- diversity_boost: 0.0–0.1, prevents echo chambers

Compute: final_score = 0.45*intent_score + 0.30*complementarity_score + 0.15*capability_score + 0.05*activity_score + 0.05*diversity_boost
Round final_score to nearest 0.05.

Return ONLY valid JSON:
{"intent_score":0.0,"complementarity_score":0.0,"capability_score":0.0,"activity_score":0.0,"diversity_boost":0.0,"final_score":0.0,"reasoning":"one sentence"}`

    // Helper: parse score JSON and assign tier
    const parseAndTier = (text: string): ScoreResult | null => {
      const m = text.match(/\{[\s\S]*\}/)
      if (!m) return null
      try {
        const result = JSON.parse(m[0])
        const s = result.final_score
        let tier: ScoreResult['tier'] = null
        if (s >= 0.85) tier = 'strong_match'
        else if (s >= 0.75) tier = 'match'
        else if (s >= 0.50) tier = 'near_match'
        return { ...result, tier }
      } catch { return null }
    }

    // Helper: call Gemini REST API
    const callGemini = async (apiKey: string): Promise<ScoreResult | null> => {
      try {
        const text = await geminiStructured(prompt, apiKey)
        return parseAndTier(text)
      } catch { return null }
    }

    // Helper: call Anthropic Haiku
    const callHaiku = async (client: Anthropic): Promise<ScoreResult | null> => {
      try {
        const response = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          messages: [{ role: 'user', content: prompt }]
        })
        const text = response.content[0].type === 'text' ? response.content[0].text : ''
        return parseAndTier(text)
      } catch { return null }
    }

    let scoreResult: ScoreResult | null = null

    // Priority order: BYOK Gemini → BYOK Anthropic → infra Gemini → infra Haiku
    if (byok?.provider === 'gemini' && byok.key) {
      scoreResult = await callGemini(byok.key)
    } else if (byok?.provider === 'anthropic' && byok.key) {
      scoreResult = await callHaiku(new Anthropic({ apiKey: byok.key }))
    }

    if (!scoreResult && process.env.GEMINI_API_KEY) {
      scoreResult = await callGemini(process.env.GEMINI_API_KEY)
    }

    if (!scoreResult) {
      scoreResult = await callHaiku(anthropic)
    }

    if (!scoreResult) return null

    // Await cache write — fire-and-forget loses writes in Vercel serverless
    if (supabase) {
      await setCachedScore(supabase, intentA.id, intentB.id, scoreResult).catch(
        e => console.error('[score] cache write failed:', e)
      )
    }

    return scoreResult
  } catch (e) {
    console.error('[score] error:', e)
    return null
  }
}
