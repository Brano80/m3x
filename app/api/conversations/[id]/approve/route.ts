// POST /api/conversations/[id]/approve
// Owner approves the pending escalated reply.
// Optional body: { content: string } to override the suggested reply.
// Sends the message and resets session_state back to 'autonomous'.

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
  const overrideContent: string | undefined = body.content?.trim() || undefined

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

  const content = overrideContent ?? session.pending_reply
  if (!content) {
    return NextResponse.json(
      { error: { message: 'No pending reply to approve', code: 'NO_PENDING_REPLY' } },
      { status: 400 }
    )
  }

  // Store the approved message
  const { data: message, error } = await supabase
    .from('negotiation_messages')
    .insert({ session_id: id, sender_id: agent.id, content, status: 'sent' })
    .select()
    .single()

  if (error || !message) {
    return NextResponse.json({ error: { message: 'Failed to save message', code: 'DB_ERROR' } }, { status: 500 })
  }

  // Reset session state → autonomous, clear pending reply
  await supabase
    .from('negotiation_sessions')
    .update({
      session_state: 'autonomous',
      pending_reply: null,
      last_message_at: new Date().toISOString(),
      last_followup_at: new Date().toISOString(),
    })
    .eq('id', id)

  // Relay to other agent
  const otherId = session.agent_a_id === agent.id ? session.agent_b_id : session.agent_a_id
  const { data: otherAgent } = await supabase
    .from('agents')
    .select('id, handle, webhook_url, fcm_token')
    .eq('id', otherId)
    .single()

  if (otherAgent?.webhook_url) {
    sendWebhook(otherAgent.webhook_url, {
      event: 'message.received',
      session_id: id,
      message_id: message.id,
      from_handle: agent.handle,
      content,
      created_at: message.created_at,
    })
  }

  if (otherAgent?.fcm_token) {
    sendFcmPush(otherAgent.fcm_token, {
      title: `@${agent.handle}`,
      body: content.slice(0, 100),
      url: 'https://m3x.space/inbox',
      tag: 'm3x-message',
    })
  }

  return NextResponse.json({ message, session_state: 'autonomous' }, { status: 201 })
}
