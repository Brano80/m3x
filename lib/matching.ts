// lib/matching.ts
// Shared matching logic — called by POST /api/intent (auto) and POST /api/matches/run (manual)

import { SupabaseClient } from '@supabase/supabase-js'
import { scorePair } from '@/lib/score'
import { sendWebhook } from '@/lib/webhook'
import { notifyMatchFound } from '@/lib/fcm'
import { generateMatchBriefing } from '@/lib/briefing'

export interface MatchRunResult {
  matches_found: number
  matches: any[]
}

/**
 * Run matching for a single intent against all candidates on the opposite side.
 * Skips the daily rate limit — designed for system-triggered calls (on intent post).
 */
export async function runMatchingForIntent(
  intent: any,
  agent: any,
  supabase: SupabaseClient,
  byok?: { provider: string; key: string }
): Promise<MatchRunResult> {
  const newMatches: any[] = []

  // Fetch embedding separately to avoid vector type issues with REST API
  const { data: intentWithEmbedding } = await supabase
    .from('intents')
    .select('embedding')
    .eq('id', intent.id)
    .single()
  const embedding = intentWithEmbedding?.embedding

  if (!embedding) return { matches_found: 0, matches: [] }

  const oppositeSide = intent.side === 'supply' ? 'demand' : 'supply'

  const { data: candidates } = await supabase.rpc('match_intents', {
    query_embedding: embedding,
    match_side: oppositeSide,
    exclude_agent_id: agent.id,
    match_count: 50,
  })

  if (!candidates?.length) return { matches_found: 0, matches: [] }

  for (const candidate of candidates) {
    // Skip if match already exists
    const { data: existing } = await supabase
      .from('matches')
      .select('id')
      .or(
        `and(intent_a_id.eq.${intent.id},intent_b_id.eq.${candidate.id}),and(intent_a_id.eq.${candidate.id},intent_b_id.eq.${intent.id})`
      )
      .maybeSingle()

    if (existing) continue

    const { data: candidateAgent } = await supabase
      .from('agents')
      .select('*')
      .eq('id', candidate.agent_id)
      .single()

    if (!candidateAgent) continue

    // Hard filter: min trust score guardrail
    const minTrust = intent.guardrails?.min_trust_score ?? 0
    if (candidateAgent.trust_score < minTrust) continue

    // Hard filter: regulation framework overlap
    const requiredFrameworks: string[] = intent.guardrails?.regulation_framework ?? []
    if (requiredFrameworks.length > 0) {
      const candidateFrameworks: string[] = candidate.guardrails?.regulation_framework ?? []
      const hasOverlap = requiredFrameworks.some((f) => candidateFrameworks.includes(f))
      if (!hasOverlap) continue
    }

    const scoreResult = await scorePair(intent, candidate, agent, candidateAgent, supabase, byok)
    if (!scoreResult || scoreResult.final_score < 0.50) continue

    const ttlDays = scoreResult.tier === 'near_match' ? 7 : 14
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString()

    const { data: match } = await supabase
      .from('matches')
      .insert({
        intent_a_id: intent.id,
        intent_b_id: candidate.id,
        agent_a_id: agent.id,
        agent_b_id: candidate.agent_id,
        score: scoreResult.final_score,
        tier: scoreResult.tier,
        score_details: scoreResult,
        state: 'discovered',
        expires_at: expiresAt,
      })
      .select()
      .single()

    if (!match) continue
    newMatches.push(match)

    // Generate match summaries for ≥75% matches (strong_match + match tiers)
    // Stored immediately so agents see full context before deciding to connect.
    if (scoreResult.tier !== 'near_match') {
      try {
        const [summaryForA, summaryForB] = await Promise.all([
          generateMatchBriefing(agent.handle, candidateAgent.handle, { ...(intent.raw_packet ?? {}), side: intent.side }, { ...(candidate.raw_packet ?? {}), side: candidate.side }),
          generateMatchBriefing(candidateAgent.handle, agent.handle, { ...(candidate.raw_packet ?? {}), side: candidate.side }, { ...(intent.raw_packet ?? {}), side: intent.side }),
        ])
        if (summaryForA || summaryForB) {
          await supabase
            .from('matches')
            .update({ summary_for_a: summaryForA || null, summary_for_b: summaryForB || null })
            .eq('id', match.id)
        }
      } catch { /* non-fatal — match is already stored */ }
    }

    const webhookPayload = (recipientAgent: any, matchedAgent: any, myIntent: any, theirIntent: any) => ({
      event: 'match.found',
      match_id: match.id,
      score: match.score,
      tier: match.tier,
      my_intent: {
        id: myIntent.id,
        side: myIntent.side,
        market: myIntent.market,
        intent_type: myIntent.intent_type,
      },
      matched_agent: {
        did: matchedAgent.did,
        handle: matchedAgent.handle,
        capabilities: matchedAgent.capabilities ?? [],
        markets: matchedAgent.markets ?? [],
        trust_score: matchedAgent.trust_score,
      },
    })

    if (agent.webhook_url) {
      sendWebhook(agent.webhook_url, webhookPayload(agent, candidateAgent, intent, candidate))
    }
    if (candidateAgent.webhook_url) {
      sendWebhook(candidateAgent.webhook_url, webhookPayload(candidateAgent, agent, candidate, intent))
    }

    // FCM push notifications
    notifyMatchFound(agent, match.score, candidateAgent.handle)
    notifyMatchFound(candidateAgent, match.score, agent.handle)

    if (agent.webhook_url || candidateAgent.webhook_url || agent.fcm_token || candidateAgent.fcm_token) {
      await supabase
        .from('matches')
        .update({ state: 'notified', push_sent_at: new Date().toISOString() })
        .eq('id', match.id)
    }
  }

  return { matches_found: newMatches.length, matches: newMatches }
}
