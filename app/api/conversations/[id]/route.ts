// GET /api/conversations/[id] — full message history for one session
// POST /api/conversations/[id] — send a message (human approved, relayed to other agent)

import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { getServiceClient } from '@/lib/supabase'
import { verifyAgent } from '@/lib/auth'
import { sendWebhook } from '@/lib/webhook'
import { sendFcmPush } from '@/lib/fcm'
import { handleIncomingMessage } from '@/lib/conversation'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = getServiceClient()
  const agent = await verifyAgent(req, supabase)
  if (!agent) {
    return NextResponse.json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }, { status: 401 })
  }

  // Verify participant
  const { data: session } = await supabase
    .from('negotiation_sessions')
    .select('*')
    .eq('id', id)
    .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`)
    .single()

  if (!session) {
    return NextResponse.json({ error: { message: 'Conversation not found', code: 'NOT_FOUND' } }, { status: 404 })
  }

  // Fetch messages
  const { data: messages } = await supabase
    .from('negotiation_messages')
    .select('id, sender_id, content, status, read, created_at')
    .eq('session_id', id)
    .eq('status', 'sent')
    .order('created_at', { ascending: true })

  // Mark unread messages from other agent as read
  await supabase
    .from('negotiation_messages')
    .update({ read: true })
    .eq('session_id', id)
    .eq('read', false)
    .neq('sender_id', agent.id)

  // Fetch other agent info
  const otherId = session.agent_a_id === agent.id ? session.agent_b_id : session.agent_a_id
  const { data: otherAgent } = await supabase
    .from('agents')
    .select('id, handle, display_name, trust_score, capabilities, markets')
    .eq('id', otherId)
    .single()

  return NextResponse.json({
    session: { id: session.id, handshake_id: session.handshake_id, state: session.state, created_at: session.created_at },
    other_agent: otherAgent,
    messages: messages ?? [],
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = getServiceClient()
  const agent = await verifyAgent(req, supabase)
  if (!agent) {
    return NextResponse.json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }, { status: 401 })
  }

  const body = await req.json()
  const { content } = body
  if (!content || typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ error: { message: 'content is required', code: 'BAD_REQUEST' } }, { status: 400 })
  }

  // Verify participant + session active
  const { data: session } = await supabase
    .from('negotiation_sessions')
    .select('*')
    .eq('id', id)
    .eq('state', 'active')
    .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`)
    .single()

  if (!session) {
    return NextResponse.json({ error: { message: 'Conversation not found or closed', code: 'NOT_FOUND' } }, { status: 404 })
  }

  // Store message
  const { data: message, error } = await supabase
    .from('negotiation_messages')
    .insert({ session_id: id, sender_id: agent.id, content: content.trim(), status: 'sent' })
    .select()
    .single()

  if (error || !message) {
    return NextResponse.json({ error: { message: 'Failed to save message', code: 'DB_ERROR' } }, { status: 500 })
  }

  // Update session last_message_at
  await supabase
    .from('negotiation_sessions')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', id)

  // Relay to other agent — webhook + FCM
  const otherId = session.agent_a_id === agent.id ? session.agent_b_id : session.agent_a_id
  const { data: otherAgent } = await supabase
    .from('agents')
    .select('id, handle, webhook_url, fcm_token, auto_reply')
    .eq('id', otherId)
    .single()

  if (otherAgent?.webhook_url) {
    sendWebhook(otherAgent.webhook_url, {
      event: 'message.received',
      session_id: id,
      message_id: message.id,
      from_handle: agent.handle,
      content: content.trim(),
      created_at: message.created_at,
    })
  }

  if (otherAgent?.fcm_token) {
    sendFcmPush(otherAgent.fcm_token, {
      title: `@${agent.handle}`,
      body: content.trim().slice(0, 100),
      url: `https://m3x.space/inbox`,
      tag: 'm3x-message',
    })
  }

  // Auto-reply: temporarily disabled
  // if (otherAgent?.auto_reply && session.session_state !== 'escalated') {
  //   waitUntil(
  //     (async () => {
  //       try {
  //         const { data: receiverIntent } = await supabase
  //           .from('intents')
  //           .select('side, market, intent_type, raw_packet')
  //           .eq('agent_id', otherAgent.id)
  //           .eq('status', 'active')
  //           .order('created_at', { ascending: false })
  //           .limit(1)
  //           .maybeSingle()
  //         const { data: recentMessages } = await supabase
  //           .from('negotiation_messages')
  //           .select('sender_id, content')
  //           .eq('session_id', id)
  //           .eq('status', 'sent')
  //           .order('created_at', { ascending: false })
  //           .limit(10)
  //         await handleIncomingMessage(
  //           supabase, id, content.trim(), agent.id, otherAgent.id,
  //           otherAgent.handle, agent.handle, receiverIntent, true,
  //           (recentMessages ?? []).reverse()
  //         )
  //       } catch (e) {
  //         console.error('[conversations] auto-reply error:', e)
  //       }
  //     })()
  //   )
  // }

  return NextResponse.json({ message }, { status: 201 })
}
