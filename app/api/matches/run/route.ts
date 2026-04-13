import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { verifyAgent } from '@/lib/auth'
import { scorePair } from '@/lib/score'
import { sendWebhook } from '@/lib/webhook'
import { decryptKey } from '@/lib/crypto'

const MAX_RUNS_PER_DAY = 5

async function checkRateLimit(supabase: any, agent: any): Promise<{ allowed: boolean; remaining: number }> {
  const now = new Date()
  const resetAt = agent.match_runs_reset_at ? new Date(agent.match_runs_reset_at) : new Date(0)
  const isNewDay = now.toDateString() !== resetAt.toDateString()

  if (isNewDay) {
    await supabase
      .from('agents')
      .update({ daily_match_runs: 1, match_runs_reset_at: now.toISOString() })
      .eq('id', agent.id)
    return { allowed: true, remaining: MAX_RUNS_PER_DAY - 1 }
  }

  const runs = agent.daily_match_runs ?? 0
  if (runs >= MAX_RUNS_PER_DAY) {
    return { allowed: false, remaining: 0 }
  }

  await supabase
    .from('agents')
    .update({ daily_match_runs: runs + 1 })
    .eq('id', agent.id)

  return { allowed: true, remaining: MAX_RUNS_PER_DAY - runs - 1 }
}

export async function POST(req: NextRequest) {
  const supabase = getServiceClient()
  const agent = await verifyAgent(req, supabase)
  if (!agent) {
    return NextResponse.json(
      { error: { message: 'Invalid or missing bearer token', code: 'UNAUTHORIZED' } },
      { status: 401 }
    )
  }

  const { allowed, remaining } = await checkRateLimit(supabase, agent)
  if (!allowed) {
    return NextResponse.json(
      { error: { message: `Rate limit reached: ${MAX_RUNS_PER_DAY} match runs per day. Resets at midnight UTC.`, code: 'RATE_LIMIT_EXCEEDED' } },
      {
        status: 429,
        headers: { 'X-RateLimit-Limit': String(MAX_RUNS_PER_DAY), 'X-RateLimit-Remaining': '0' }
      }
    )
  }

  const byok = agent.byok_key_enc && agent.byok_provider
    ? { provider: agent.byok_provider, key: (() => { try { return decryptKey(agent.byok_key_enc) } catch { return null } })() }
    : null
  const resolvedByok = byok?.key ? (byok as { provider: string; key: string }) : undefined

  const { data: myIntents } = await supabase
    .from('intents')
    .select('id, agent_id, side, market, intent_type, raw_packet, guardrails, status, expires_at, created_at')
    .eq('agent_id', agent.id)
    .eq('status', 'active')

  if (!myIntents?.length) {
    return NextResponse.json(
      { matches_found: 0, matches: [], message: 'No active intents', rate_limit: { remaining } },
      { headers: { 'X-RateLimit-Limit': String(MAX_RUNS_PER_DAY), 'X-RateLimit-Remaining': String(remaining) } }
    )
  }

  const newMatches = []

  for (const intent of myIntents) {
    // Fetch embedding separately to avoid vector type issues with REST API
    const { data: intentWithEmbedding } = await supabase
      .from('intents')
      .select('embedding')
      .eq('id', intent.id)
      .single()
    const embedding = intentWithEmbedding?.embedding

    if (!embedding) continue

    const oppositeSide = intent.side === 'supply' ? 'demand' : 'supply'

    const { data: candidates } = await supabase.rpc('match_intents', {
      query_embedding: embedding,
      match_side: oppositeSide,
      exclude_agent_id: agent.id,
      match_count: 50
    })

    if (!candidates?.length) continue

    for (const candidate of candidates) {
      const { data: existing } = await supabase
        .from('matches')
        .select('id')
        .or(`and(intent_a_id.eq.${intent.id},intent_b_id.eq.${candidate.id}),and(intent_a_id.eq.${candidate.id},intent_b_id.eq.${intent.id})`)
        .maybeSingle()

      if (existing) continue

      const { data: candidateAgent } = await supabase
        .from('agents')
        .select('*')
        .eq('id', candidate.agent_id)
        .single()

      if (!candidateAgent) continue

      const minTrust = intent.guardrails?.min_trust_score ?? 0
      if (candidateAgent.trust_score < minTrust) continue

      const scoreResult = await scorePair(intent, candidate, agent, candidateAgent, supabase, resolvedByok)
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
          expires_at: expiresAt
        })
        .select()
        .single()

      if (!match) continue
      newMatches.push(match)

      const webhookPayload = (recipientAgent: any, matchedAgent: any, myIntent: any, theirIntent: any) => ({
        event: 'match.found',
        match_id: match.id,
        score: match.score,
        tier: match.tier,
        my_intent: { id: myIntent.id, side: myIntent.side, market: myIntent.market, intent_type: myIntent.intent_type },
        matched_agent: {
          did: matchedAgent.did,
          handle: matchedAgent.handle,
          capabilities: matchedAgent.capabilities ?? [],
          markets: matchedAgent.markets ?? [],
          trust_score: matchedAgent.trust_score
        }
      })

      if (agent.webhook_url) {
        sendWebhook(agent.webhook_url, webhookPayload(agent, candidateAgent, intent, candidate))
      }
      if (candidateAgent.webhook_url) {
        sendWebhook(candidateAgent.webhook_url, webhookPayload(candidateAgent, agent, candidate, intent))
      }

      if (agent.webhook_url || candidateAgent.webhook_url) {
        await supabase
          .from('matches')
          .update({ state: 'notified', push_sent_at: new Date().toISOString() })
          .eq('id', match.id)
      }
    }
  }

  return NextResponse.json(
    { matches_found: newMatches.length, matches: newMatches, rate_limit: { remaining } },
    { headers: { 'X-RateLimit-Limit': String(MAX_RUNS_PER_DAY), 'X-RateLimit-Remaining': String(remaining) } }
  )
}
