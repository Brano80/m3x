// POST /api/handshake/accept
// Accepts a pending handshake.
// On acceptance: both agents receive each other's webhook URL.
// This is the identity reveal moment — the private pool opens exactly here.

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { verifyAgent } from '@/lib/auth'
import { sendWebhook } from '@/lib/webhook'
import { recalculateTrust } from '@/lib/trust'

export async function POST(req: NextRequest) {
  const supabase = getServiceClient()
  const agent = await verifyAgent(req, supabase)
  if (!agent) {
    return NextResponse.json(
      { error: { message: 'Invalid or missing bearer token', code: 'UNAUTHORIZED' } },
      { status: 401 }
    )
  }

  const body = await req.json()
  const { handshake_id } = body

  if (!handshake_id) {
    return NextResponse.json(
      { error: { message: 'handshake_id is required', code: 'MISSING_HANDSHAKE_ID' } },
      { status: 400 }
    )
  }

  // Fetch handshake — agent must be a participant but NOT the initiator
  const { data: handshake } = await supabase
    .from('handshakes')
    .select('*')
    .eq('id', handshake_id)
    .eq('state', 'pending')
    .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`)
    .single()

  if (!handshake) {
    return NextResponse.json(
      { error: { message: 'Handshake not found, already resolved, or you are not a participant', code: 'HANDSHAKE_NOT_FOUND' } },
      { status: 404 }
    )
  }

  if (handshake.initiated_by === agent.id) {
    return NextResponse.json(
      { error: { message: 'You initiated this handshake — wait for the other agent to accept', code: 'CANNOT_ACCEPT_OWN' } },
      { status: 400 }
    )
  }

  // Get both agents with webhook URLs
  const otherAgentId = handshake.agent_a_id === agent.id ? handshake.agent_b_id : handshake.agent_a_id

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://m3x.space'

  const [{ data: otherAgent }, { data: match }] = await Promise.all([
    supabase.from('agents').select('id, handle, did, webhook_url, a2a_endpoint, capabilities, markets, trust_score').eq('id', otherAgentId).single(),
    supabase.from('matches').select('score, tier').eq('id', handshake.match_id).single(),
  ])

  if (!otherAgent) {
    return NextResponse.json(
      { error: { message: 'Other agent not found', code: 'AGENT_NOT_FOUND' } },
      { status: 404 }
    )
  }

  // Activate handshake
  const { error } = await supabase
    .from('handshakes')
    .update({ state: 'active' })
    .eq('id', handshake_id)

  if (error) {
    return NextResponse.json(
      { error: { message: error.message, code: 'DB_ERROR' } },
      { status: 500 }
    )
  }

  // Update match state
  await supabase
    .from('matches')
    .update({ state: 'accepted' })
    .eq('id', handshake.match_id)

  // Recalculate trust scores — both agents responded positively
  await Promise.all([
    recalculateTrust(agent.id, supabase, 'handshake_accepted'),
    recalculateTrust(otherAgentId, supabase, 'handshake_accepted'),
  ])

  // IDENTITY REVEAL — send each agent the other's webhook URL
  // This is the moment the private pool opens: only after mutual commitment
  const revealPayload = (myAgent: any, theirAgent: any) => ({
    event: 'handshake.active',
    handshake_id,
    match_id: handshake.match_id,
    score: match?.score,
    tier: match?.tier,
    connected_agent: {
      did: theirAgent.did,
      handle: theirAgent.handle,
      capabilities: theirAgent.capabilities ?? [],
      markets: theirAgent.markets ?? [],
      trust_score: theirAgent.trust_score,
      webhook_url: theirAgent.webhook_url,       // ← identity reveal
      a2a_endpoint: theirAgent.a2a_endpoint ?? null,
      a2a_card_url: `${APP_URL}/api/a2a/${theirAgent.handle}`,
      did_document_url: `${APP_URL}/api/did/${theirAgent.handle}`,
    },
    message: 'Handshake accepted. You can now communicate directly via webhook.',
  })

  const webhookPromises = []
  if (agent.webhook_url) {
    webhookPromises.push(sendWebhook(agent.webhook_url, revealPayload(agent, otherAgent)))
  }
  if (otherAgent.webhook_url) {
    webhookPromises.push(sendWebhook(otherAgent.webhook_url, revealPayload(otherAgent, agent)))
  }
  await Promise.allSettled(webhookPromises)

  return NextResponse.json({
    handshake: { id: handshake_id, state: 'active' },
    connected_agent: {
      did: otherAgent.did,
      handle: otherAgent.handle,
      capabilities: otherAgent.capabilities ?? [],
      markets: otherAgent.markets ?? [],
      trust_score: otherAgent.trust_score,
      webhook_url: otherAgent.webhook_url,
      a2a_endpoint: otherAgent.a2a_endpoint ?? null,
      a2a_card_url: `${APP_URL}/api/a2a/${otherAgent.handle}`,
      did_document_url: `${APP_URL}/api/did/${otherAgent.handle}`,
    },
    message: 'Handshake active. Both agents have been notified with each other\'s webhook URL.',
 