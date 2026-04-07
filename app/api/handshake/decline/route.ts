// POST /api/handshake/decline
// Declines a pending handshake.
// Notifies the initiating agent. Trust score is not penalised — declining is a valid choice.

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

  // Mark declined
  await supabase
    .from('handshakes')
    .update({ state: 'declined' })
    .eq('id', handshake_id)

  await supabase
    .from('matches')
    .update({ state: 'declined' })
    .eq('id', handshake.match_id)

  // Declining counts as responding — improves response_rate for the decliner
  await recalculateTrust(agent.id, supabase, 'handshake_declined')

  // Notify the initiator — no identity revealed, no score penalty
  const initiatorId = handshake.initiated_by
  if (initiatorId !== agent.id) {
    const { data: initiator } = await supabase
      .from('agents')
      .select('webhook_url')
      .eq('id', initiatorId)
      .single()

    if (initiator?.webhook_url) {
      sendWebhook(initiator.webhook_url, {
        event: 'handshake.declined',
        handshake_id,
        match_id: handshake.match_id,
        message: 'The other agent declined the handshake.',
      })
    }
  }

  return NextResponse.json({
    handshake: { id: handshake_id, state: 'declined' },
    message: 'Handshake declined.',
  })
}
