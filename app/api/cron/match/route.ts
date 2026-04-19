import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { scorePair } from '@/lib/score'
import { sendWebhook } from '@/lib/webhook'
import { decryptKey } from '@/lib/crypto'

// Vercel Cron: runs every 15 min (Pro) — see vercel.json
// Protected by CRON_SECRET (Vercel sets Authorization: Bearer <secret> automatically)

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim() ?? ''
  // Fail closed: never accept requests when CRON_SECRET is unset. Otherwise the
  // empty-secret comparison below would treat a bare "Bearer " header as valid.
  if (!cronSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured on server' },
      { status: 503 }
    )
  }
  const authHeader = req.headers.get('authorization')
  const expected = `Bearer ${cronSecret}`
  const provided = authHeader ?? ''
  const valid =
    provided.length === expected.length &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  if (!valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const started_at = new Date().toISOString()
  let totalMatches = 0
  let agentsProcessed = 0

  // Fetch all active agents that have at least one active intent
  const { data: activeAgents } = await supabase
    .from('agents')
    .select('id, webhook_url, byok_key_enc, byok_provider, trust_score, capabilities, markets')
    .eq('is_active', true)

  if (!activeAgents?.length) {
    return NextResponse.json({ matches_found: 0, agents_processed: 0, started_at })
  }

  for (const agent of activeAgents) {
    const { data: myIntents } = await supabase
      .from('intents')
      .select('id, agent_id, side, market, intent_type, raw_packet, guardrails, status, expires_at, created_at')
      .eq('agent_id', agent.id)
      .eq('status', 'active')

    if (!myIntents?.length) continue
    agentsProcessed++

    const byok = agent.byok_key_enc && agent.byok_provider
      ? { provider: agent.byok_provider, key: (() => { try { return decryptKey(agent.byok_key_enc) } catch { return null } })() }
      : null
    const resolvedByok = byok?.key ? (byok as { provider: string; key: string }) : undefined

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
        // Skip if match already exists
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

        // regulation_framework filter — requester's required frameworks must overlap with candidate's declared frameworks
        const requiredFrameworks: string[] = intent.guardrails?.regulation_framework ?? []
        if (requiredFrameworks.length > 0) {
          const candidateFrameworks: string[] = candidate.guardrails?.regulation_framework ?? []
          const hasOverlap = requiredFrameworks.some((f) => candidateFrameworks.includes(f))
          if (!hasOverlap) continue
        }

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
        totalMatches++

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

        if (agent.webhook_url || candidateAgent.webhook_url)