import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { verifyAgent } from '@/lib/auth'
import { scorePair } from '@/lib/score'
import { sendWebhook } from '@/lib/webhook'

export async function POST(req: NextRequest) {
  const supabase = getServiceClient()
  const agent = await verifyAgent(req, supabase)
  if (!agent) {
    return NextResponse.json(
      { error: { message: 'Invalid or missing bearer token', code: 'UNAUTHORIZED' } },
      { status: 401 }
    )
  }

  const { data: myIntents } = await supabase
    .from('intents')
    .select('*')
    .eq('agent_id', agent.id)
    .eq('status', 'active')

  if (!myIntents?.length) {
    return NextResponse.json({ matches_found: 0, matches: [], message: 'No active intents' })
  }

  const newMatches = []

  for (const intent of myIntents) {
    if (!intent.embedding) continue

    const oppositeSide = intent.side === 'supply' ? 'demand' : 'supply'

    const { data: candidates } = await supabase.rpc('match_intents', {
      query_embedding: intent.embedding,
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

      const scoreResult = await scorePair(intent, candidate, agent, candidateAgent)
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

      // Fire webhooks to both agents — non-blocking
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

      // Mark match as notified if at least one webhook fired
      if (agent.webhook_url || candidateAgent.webhook_url) {
        await supabase
          .from('matches')
          .update({ state: 'notified', push_sent_at: new Date().toISOString() })
          .eq('id', match.id)
      }
    }
  }

  return NextResponse.json({ matches_found: newMatches.length, matches: newMatches })
}
