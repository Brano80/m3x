// POST /api/conversations/[id]/retract
// Owner rejects/discards the escalated pending reply without sending.
// Resets session_state to 'autonomous' — agent resumes auto-reply.
// Optional body: { manual_reply: string } to send a manual message instead.

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { verifyAgent } from '@/lib/auth'
import { sendWebhook } from '@/lib/webhook'
import { sendFcmPush } from '@/lib/fcm'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = getServiceClient()
  const agent = await verifyAgent(req, supabase)
  if (!agent) {
    return NextResponse.json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const manualReply: string | undefined = body.manual_reply?.trim() || undefined

  // Fetch session — must be escalated and agent must be a participant
  const { data: session } = await supabase
    .from('negotiation_sessions')
    .select('*')
    .eq('id', id)
    .eq('session_state', 'escalated')
    .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`)
    .single()

  if (!session) {
    return NextResponse.json(
      { error: { message: 'No escalated conversation found', code: 'NOT_FOUND' } },
      { status: 404 }
    )
  }

  // Reset session state — discard pending reply
  await supabase
    .from('negotiation_sessions')
    .update({
      session_state: 'autonomous',
      pending_reply: null,
    })
    .eq('id', id)

  // If owner provided a manual reply, send it
  let sentMessage = null
  if (manualReply) {
    const { data: message } = await supabase
      .from('negotiation_messages')
      .insert({ session_id: id, sender_id: agent.id, content: manualReply, status: 'sent' })
      .select()
      .single()

    sentMessage = message

    await supabase
      .from('negotiation_sessions')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', id)

    const otherId = session.agent_a_id === agent.id ? session.agent_b_id : session.agent_a_id
    const { data: otherAgent } = await supabase
      .from('agents')
      .select('id, handle, webhook_url, fcm_token')
      .eq('id', otherId)
      .single()

    if (otherAgent?.webhook_url && message) {
      sendWebhook(otherAgent.webhook_url, {
        event: 'message.received',
        session_id: id,
        message_id: message.id,
        from_handle: agent.handle,
        content: manualReply,
        created_at: message.created_at,
      })
    }

    if (otherAgent?.fcm_token) {
      sendFcmPush(otherAgent.fcm_token, {
        title: `@${agent.handle}`,
        body: manualReply.slice(0, 100),
        url: 'https://m3x.space/inbox',
        tag: 'm3x-message',
      })
    }
  }

  return NextResponse.json({
    session_state: 'autonomous',
    message: sentMessage ?? null,
  })
}
