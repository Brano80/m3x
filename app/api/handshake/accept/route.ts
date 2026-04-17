// POST /api/handshake/accept
// Accepts a pending handshake. Opens the conversation channel.
// Match summary was already generated at match time — no reveals here.
// Contact details are shared personally by the parties in conversation.

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { verifyAgent } from '@/lib/auth'
import { sendWebhook } from '@/lib/webhook'
import { recalculateTrust } from '@/lib/trust'
import { notifyHandshakeAccepted } from '@/lib/fcm'

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
    .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`)
    .single()

  if (!handshake) {
    return NextResponse.json(
      { error: { message: 'Handshake not found or you are not a participant', code: 'HANDSHAKE_NOT_FOUND' } },
      { status: 404 }
    )
  }

  if (handshake.state !== 'pending') {
    return NextResponse.json(
      { error: { message: 'Handshake already resolved', code: 'ALREADY_RESOLVED' } },
      { status: 409 }
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

  const [{ data: otherAgent }, { data: matchData }] = await Promise.all([
    supabase.from('agents').select('id, handle, did, webhook_url, a2a_endpoint, capabilities, markets, trust_score, fcm_token').eq('id', otherAgentId).single(),
    supabase.from('matches').select('score, tier, intent_a_id, intent_b_id, agent_a_id, summary_for_a, summary_for_b').eq('id', handshake.match_id).single(),
  ])

  if (!otherAgent) {
    return NextResponse.json(
      { error: { message: 'Other agent not found', code: 'AGENT_NOT_FOUND' } },
      { status: 404 }
    )
  }

  // Activate handshake (atomic: only succeeds if still pending)
  const { data: updated, error } = await supabase
    .from('handshakes')
    .update({ state: 'active' })
    .eq('id', handshake_id)
    .eq('state', 'pending')
    .select('id')
    .single()

  if (error || !updated) {
    return NextResponse.json(
      { error: { message: 'Handshake already resolved or not found', code: 'ALREADY_RESOLVED' } },
      { status: 409 }
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

  // Notify both agents via webhook — handshake is now active
  const activatedPayload = {
    event: 'handshake.active',
    handshake_id,
    match_id: handshake.match_id,
    connected_agent: {
      did: otherAgent.did,
      handle: otherAgent.handle,
      capabilities: otherAgent.capabilities ?? [],
      markets: otherAgent.markets ?? [],
      trust_score: otherAgent.trust_score,
      a2a_card_url: `${APP_URL}/api/a2a/${otherAgent.handle}`,
      did_document_url: `${APP_URL}/api/did/${otherAgent.handle}`,
    },
  }

  const webhookPromises = []
  if (agent.webhook_url) webhookPromises.push(sendWebhook(agent.webhook_url, activatedPayload))
  if (otherAgent.webhook_url) webhookPromises.push(sendWebhook(otherAgent.webhook_url, activatedPayload))
  await Promise.allSettled(webhookPromises)

  // FCM push — notify initiator their handshake was accepted
  notifyHandshakeAccepted(otherAgent, agent.handle)

  // Open the conversation channel
  const { data: session } = await supabase.from('negotiation_sessions').upsert({
    handshake_id: handshake_id,
    agent_a_id: handshake.initiated_by,
    agent_b_id: agent.id,
  }, { onConflict: 'handshake_id', ignoreDuplicates: true }).select('id').single()

  // Seed briefing messages — one per agent, visible only to them
  if (session && matchData) {
    const isInitiatorA = matchData.agent_a_id === handshake.initiated_by
    const summaryForInitiator = isInitiatorA ? (matchData as any).summary_for_a : (matchData as any).summary_for_b
    const summaryForAcceptor  = isInitiatorA ? (matchData as any).summary_for_b : (matchData as any).summary_for_a

    const briefings = []
    if (summaryForInitiator) briefings.push({
      session_id: session.id,
      sender_id: null,
      recipient_id: handshake.initiated_by,
      content: summaryForInitiator,
      status: 'briefing',
      read: false,
    })
    if (summaryForAcceptor) briefings.push({
      session_id: session.id,
      sender_id: null,
      recipient_id: agent.id,
      content: summaryForAcceptor,
      status: 'briefing',
      read: false,
    })
    if (briefings.length) await supabase.from('negotiation_messages').insert(briefings)
  }

  return NextResponse.json({
    handshake: { id: handshake_id, state: 'active' },
    connected_agent: {
      did: otherAgent.did,
      handle: otherAgent.handle,
      capabilities: otherAgent.capabilities ?? [],
      markets: otherAgent.markets ?? [],
      trust_score: otherAgent.trust_score,
      a2a_card_url: `${APP_URL}/api/a2a/${otherAgent.handle}`,
      did_document_url: `${APP_URL}/api/did/${otherAgent.handle}`,
    },
    message: 'Handshake active. Conversation is now open.',
  })
}
