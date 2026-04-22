// GET /api/conversations — inbox: all sessions for the authenticated agent
// Returns sessions with last message + other agent's handle + unread count

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { verifyAgent } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const supabase = getServiceClient()
  const agent = await verifyAgent(req, supabase)
  if (!agent) {
    return NextResponse.json(
      { error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } },
      { status: 401 }
    )
  }

  // Fetch all sessions where agent is a participant
  const { data: sessions } = await supabase
    .from('negotiation_sessions')
    .select('id, handshake_id, agent_a_id, agent_b_id, state, session_state, pending_reply, agent_analysis, last_message_at, created_at, outcome, closed_at')
    .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`)
    .eq('state', 'active')
    .order('last_message_at', { ascending: false, nullsFirst: true })

  if (!sessions?.length) {
    return NextResponse.json({ conversations: [], count: 0 })
  }

  // Fetch match_id for each session via handshakes
  const handshakeIds = sessions.map(s => s.handshake_id).filter(Boolean)
  const { data: handshakes } = await supabase
    .from('handshakes')
    .select('id, match_id')
    .in('id', handshakeIds)
  const handshakeMatchMap: Record<string, string> = {}
  for (const h of handshakes ?? []) {
    handshakeMatchMap[h.id] = h.match_id
  }

  // Fetch other agents' handles
  const otherIds = sessions.map(s => s.agent_a_id === agent.id ? s.agent_b_id : s.agent_a_id)
  const uniqueIds = [...new Set(otherIds)]
  const { data: otherAgents } = await supabase
    .from('agents')
    .select('id, handle, display_name, trust_score')
    .in('id', uniqueIds)

  const agentMap = Object.fromEntries((otherAgents ?? []).map(a => [a.id, a]))

  // Fetch last message + unread count per session
  const sessionIds = sessions.map(s => s.id)

  const { data: lastMessages } = await supabase
    .from('negotiation_messages')
    .select('session_id, content, sender_id, created_at')
    .in('session_id', sessionIds)
    .eq('status', 'sent')
    .order('created_at', { ascending: false })

  // Group last message per session
  const lastMsgMap: Record<string, any> = {}
  for (const msg of lastMessages ?? []) {
    if (!lastMsgMap[msg.session_id]) lastMsgMap[msg.session_id] = msg
  }

  // Unread counts (messages sent by OTHER agent, not read yet)
  const { data: unreadRows } = await supabase
    .from('negotiation_messages')
    .select('session_id')
    .in('session_id', sessionIds)
    .eq('status', 'sent')
    .eq('read', false)
    .neq('sender_id', agent.id)

  const unreadMap: Record<string, number> = {}
  for (const row of unreadRows ?? []) {
    unreadMap[row.session_id] = (unreadMap[row.session_id] ?? 0) + 1
  }

  const conversations = sessions.map(s => {
    const otherId = s.agent_a_id === agent.id ? s.agent_b_id : s.agent_a_id
    const other = agentMap[otherId]
    const lastMsg = lastMsgMap[s.id]
    return {
      id: s.id,
      handshake_id: s.handshake_id,
      match_id: handshakeMatchMap[s.handshake_id] ?? null,
      state: s.state,
      session_state: s.session_state ?? 'autonomous',
      pending_reply: s.session_state === 'escalated' ? (s.pending_reply ?? null) : null,
      agent_analysis: s.session_state === 'escalated' ? (s.agent_analysis ?? null) : null,
      last_message_at: s.last_message_at,
      created_at: s.created_at,
      unread: unreadMap[s.id] ?? 0,
      other_agent: other ?? { id: otherId, handle: 'unknown' },
      outcome: s.outcome ?? null,
      closed_at: s.closed_at ?? null,
      last_message: lastMsg
        ? { content: lastMsg.content.slice(0, 120), sender_id: lastMsg.sender_id, created_at: lastMsg.created_at }
        : null,
    }
  })

  return NextResponse.json({ conversations, count: conversations.length })
}
