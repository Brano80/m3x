// POST /api/handshake
// Initiates a handshake with a matched agent.
// Sets state to 'pending' and notifies the other agent via webhook.

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { verifyAgent } from '@/lib/auth'
import { sendWebhook } from '@/lib/webhook'
import { notifyHandshake } from '@/lib/fcm'
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
  const { match_id } = body

  if (!match_id) {
    return NextResponse.json(
      { error: { message: 'match_id is required', code: 'MISSING_MATCH_ID' } },
      { status: 400 }
    )
  }

  // Fetch match — agent must be a participant
  const { data: match } = await supabase
    .from('matches')
    .select('*')
    .eq('id', match_id)
    .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (!match) {
    return NextResponse.json(
      { error: { message: 'Match not found, expired, or you are not a participant', code: 'MATCH_NOT_FOUND' } },
      { status: 404 }
    )
  }

  // Check handshake doesn't already exist
  const { data: existing } = await supabase
    .from('handshakes')
    .select('id, state')
    .eq('match_id', match_id)
    .maybeSingle()

  if (existing) {
    // If the handshake is pending and this agent is the OTHER party → auto-accept
    if (existing.state === 'pending') {
      const { data: hs } = await supabase
        .from('handshakes')
        .select('initiated_by')
        .eq('id', existing.id)
        .single()
      if (hs && hs.initiated_by !== agent.id) {
        // Delegate to accept logic by forwarding internally
        const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://www.m3x.space')}/api/handshake/accept`
        const acceptRes = await fetch(acceptUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: req.headers.get('Authorization') ?? '' },
          body: JSON.stringify({ handshake_id: existing.id }),
        })
        const acceptData = await acceptRes.json()
        return NextResponse.json(acceptData, { status: acceptRes.status })
      }
    }
    return NextResponse.json(
      { error: { message: `Handshake already exists (state: ${existing.state})`, code: 'HANDSHAKE_EXISTS' } },
      { status: 409 }
    )
  }

  // Identify the other agent
  const otherAgentId = match.agent_a_id === agent.id ? match.agent_b_id : match.agent_a_id

  const { data: otherAgent } = await supabase
    .from('agents')
    .select('id, handle, did, webhook_url, capabilities, markets, trust_score, fcm_token')
    .eq('id', otherAgentId)
    .single()

  if (!otherAgent) {
    return NextResponse.json(
      { error: { message: 'Matched agent not found', code: 'AGENT_NOT_FOUND' } },
      { status: 404 }
    )
  }

  // Create handshake in pending state
  const { data: handshake, error } = await supabase
    .from('handshakes')
    .insert({
      match_id,
      agent_a_id: agent.id,
      agent_b_id: otherAgentId,
      initiated_by: agent.id,
      state: 'pending',
    })
    .select()
    .single()

  if (error || !handshake) {
    return NextResponse.json(
      { error: { message: error?.message ?? 'Failed to create handshake', code: 'DB_ERROR' } },
      { status: 500 }
    )
  }

  // Update match state
  await supabase
    .from('matches')
    .update({ state: 'handshake_initiated' })
    .eq('id', match_id)

  // Update receiving agent's trust score — their received count just went up
  recalculateTrust(otherAgentId, supabase, 'handshake_received')

  // FCM push to other agent
  notifyHandshake(otherAgent, agent.handle)

  // Notify the other agent via webhook — no identity revealed yet
  if (otherAgent.webhook_url) {
    sendWebhook(otherAgent.webhook_url, {
      event: 'handshake.requested',
      handshake_id: handshake.id,
      match_id,
      score: match.score,
      tier: match.tier,
      // Identity NOT revealed here — only on mutual acceptance
      from_agent: {
        capabilities: agent.capabilities ?? [],
        markets: agent.markets ?? [],
        trust_score: agent.trust_score,
      },
      action_required: 'Call POST /api/handshake/accept or /api/handshake/decline',
    })
  }

  return NextResponse.json({
    handshake: { id: handshake.id, match_id, state: handshake.state },
    message: 'Handshake initiated. Waiting for the other agent to accept.',
  }, { status: 201 })
}

// GET /api/handshake — list your handshakes
export async function GET(req: NextRequest) {
  const supabase = getServiceClient()
  const agent = await verifyAgent(req, supabase)
  if (!agent) {
    return NextResponse.json(
      { error: { message: 'Invalid or missing bearer token', code: 'UNAUTHORIZED' } },
      { status: 401 }
    )
  }

  const { data: handshakes } = await supabase
    .from('handshakes')
    .select('id, match_id, state, initiated_by, created_at, agent_a_id, agent_b_id')
    .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`)
    .order('created_at', { ascending: false })

  return NextResponse.json({ handshakes: handshakes ?? [], count: handshakes?.length ?? 0 })
}
