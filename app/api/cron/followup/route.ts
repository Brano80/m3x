// GET /api/cron/followup
// Vercel cron — runs every 6 hours.
// Finds active negotiation sessions that have been silent for 24+ hours
// where the last message was FROM the other agent (i.e., the auto_reply agent hasn't responded).
// Sends a gentle follow-up nudge from the agent.

import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { geminiConversational } from '@/lib/gemini'
import { sendFcmPush } from '@/lib/fcm'

const STALE_HOURS = 24
const MAX_FOLLOWUPS_PER_SESSION = 3

export async function GET(req: NextRequest) {
  // Vercel cron auth
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
  const cutoff = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000).toISOString()

  // Find sessions:
  // - state = active
  // - session_state = 'autonomous' (not already escalated)
  // - last_message_at older than 24h
  // - last_followup_at is null OR also older than 24h (avoid spamming)
  const { data: staleSessions } = await supabase
    .from('negotiation_sessions')
    .select('id, agent_a_id, agent_b_id, auto_reply_count, last_followup_at')
    .eq('state', 'active')
    .eq('session_state', 'autonomous')
    .lt('last_message_at', cutoff)
    .or(`last_followup_at.is.null,last_followup_at.lt.${cutoff}`)
    .limit(50)

  if (!staleSessions?.length) {
    return NextResponse.json({ nudged: 0 })
  }

  let nudged = 0

  for (const session of staleSessions) {
    try {
      // Don't follow up more than MAX times per session
      if ((session.auto_reply_count ?? 0) >= MAX_FOLLOWUPS_PER_SESSION) continue

      // Find which agent has auto_reply enabled
      const [{ data: agentA }, { data: agentB }] = await Promise.all([
        supabase.from('agents').select('id, handle, auto_reply, fcm_token').eq('id', session.agent_a_id).single(),
        supabase.from('agents').select('id, handle, auto_reply, fcm_token').eq('id', session.agent_b_id).single(),
      ])

      // Pick the auto_reply agent — if neither has it, skip
      const autoAgent = agentA?.auto_reply ? agentA : agentB?.auto_reply ? agentB : null
      if (!autoAgent) continue

      const otherAgent = autoAgent.id === agentA?.id ? agentB : agentA
      if (!otherAgent) continue

      // Fetch last message to check it was from the OTHER agent (meaning auto-agent hasn't replied)
      const { data: lastMsg } = await supabase
        .from('negotiation_messages')
        .select('sender_id, content')
        .eq('session_id', session.id)
        .eq('status', 'sent')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      // Only nudge if the last message was from the OTHER agent (auto-agent owes a response)
      if (!lastMsg || lastMsg.sender_id !== otherAgent.id) continue

      // Generate a follow-up nudge — cap the peer message at 300 chars so
      // attacker-controlled content can't dominate / inject into the prompt.
      const lastContent = String(lastMsg.content ?? '').slice(0, 300)
      const prompt = `You are an AI agent for @${autoAgent.handle} in a B2B conversation on M3X.

The other party (@${otherAgent.handle}) sent a message 24+ hours ago and you haven't responded.

Their last message: "${lastContent}"

Write a brief, natural follow-up message (1-2 sentences) acknowledging their message and moving things forward.
Be warm but professional. Don't apologize for the delay. No emojis.

Reply with ONLY the message text.`

      let nudgeText = ''
      if (process.env.GEMINI_API_KEY) {
        nudgeText = await geminiConversational(prompt, process.env.GEMINI_API_KEY, 200).catch(() => '')
      }

      if (!nudgeText) continue

      // Insert the follow-up message
      await supabase.from('negotiation_messages').insert({
        session_id: session.id,
        sender_id: autoAgent.id,
        content: nudgeText,
        status: 'sent',
      })

      // Update session timestamps
      await supabase
        .from('negotiation_sessions')
        .update({
          last_message_at: new Date().toISOString(),
          last_followup_at: new Date().toISOString(),
          auto_reply_count: (session.auto_reply_count ?? 0) + 1,
        })
        .eq('id', sess