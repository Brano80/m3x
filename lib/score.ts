import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export interface ScoreResult {
  final_score: number
  intent_score: number
  complementarity_score: number
  capability_score: number
  trust_score: number
  activity_score: number
  diversity_boost: number
  tier: 'strong_match' | 'match' | 'near_match' | null
  reasoning: string
}

export async function scorePair(
  intentA: any,
  intentB: any,
  agentA: any,
  agentB: any
): Promise<ScoreResult | null> {
  try {
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
- trust_score: normalize lower agent trust (divide by 100)
- activity_score: default 0.5 unless signals suggest otherwise
- diversity_boost: 0.0–0.1, prevents echo chambers

Compute: final_score = 0.30*intent_score + 0.20*complementarity_score + 0.15*capability_score + 0.15*trust_score + 0.15*activity_score + 0.05*diversity_boost
Round final_score to nearest 0.05.

Return ONLY valid JSON:
{"intent_score":0.0,"complementarity_score":0.0,"capability_score":0.0,"trust_score":0.0,"activity_score":0.0,"diversity_boost":0.0,"final_score":0.0,"reasoning":"one sentence"}`

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }]
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null

    const result = JSON.parse(match[0])
    const s = result.final_score

    let tier: ScoreResult['tier'] = null
    if (s >= 0.85) tier = 'strong_match'
    else if (s >= 0.75) tier = 'match'
    else if (s >= 0.50) tier = 'near_match'

    return { ...result, tier }
  } catch (e) {
    console.error('[score] error:', e)
    return null
  }
}
