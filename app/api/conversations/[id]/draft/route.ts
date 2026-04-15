// POST /api/conversations/[id]/draft
// Gemini reads conversation history + original Demand Packet context
// and generates a reply suggestion for human review before sending.

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { verifyAgent } from '@/lib/auth'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

async function geminiDraft(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string
): Promise<string | null> {
  try {
    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 400 },
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = getServiceClient()
  const agent = await verifyAgent(req, supabase)
  if (!agent) {
    return NextResponse.json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }, { status: 401 })
  }

  // Verify participant
  const { data: session } = await supabase
    .from('negotiation_sessions')
    .select('*, handshake_id')
    .eq('id', id)
    .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`)
    .single()

  if (!session) {
    return NextResponse.json({ error: { message: 'Conversation not found', code: 'NOT_FOUND' } }, { status: 404 })
  }

  // Fetch recent messages (last 10)
  const { data: messages } = await supabase
    .from('negotiation_messages')
    .select('sender_id, content, created_at')
    .eq('session_id', id)
    .eq('status', 'sent')
    .order('created_at', { ascending: false })
    .limit(10)

  const chronological = (messages ?? []).reverse()

  // Fetch my active intent for context
  const { data: myIntent } = await supabase
    .from('intents')
    .select('side, market, intent_type, raw_packet')
    .eq('agent_id', agent.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Fetch other agent info
  const otherId = session.agent_a_id === agent.id ? session.agent_b_id : session.agent_a_id
  const { data: otherAgent } = await supabase
    .from('agents')
    .select('handle, capabilities, markets')
    .eq('id', otherId)
    .single()

  // Build context for Gemini
  const intentContext = myIntent
    ? `Your agent's intent: ${myIntent.side} in ${myIntent.market} market, type: ${myIntent.intent_type}.
Demand packet context: ${JSON.stringify(myIntent.raw_packet?.offers ?? {})} | ${JSON.stringify(myIntent.raw_packet?.seeking ?? {})}`
    : 'No active intent on file.'

  const conversationHistory = chronological.length
    ? chronological.map(m => `${m.sender_id === agent.id ? 'You' : `@${otherAgent?.handle ?? 'them'}`}: ${m.content}`).join('\n')
    : 'No messages yet — this is the opening message.'

  const systemPrompt = `You are a professional business communication assistant for an AI agent matchmaking platform called M3X.
Your job is to draft a concise, professional reply on behalf of the agent based on their intent context and conversation history.
Keep the reply under 3 sentences. Be direct, warm, and professional. No fluff. No emojis.
The human will review, edit, and approve this draft before it is sent.`

  const userPrompt = `Context about my agent:
${intentContext}

Other agent: @${otherAgent?.handle ?? 'unknown'} — capabilities: ${(otherAgent?.capabilities ?? []).join(', ')}

Conversation so far:
${conversationHistory}

Draft a reply from my agent's perspective.`

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: { message: 'AI drafting not available', code: 'NO_API_KEY' } }, { status: 503 })
  }

  const draft = await geminiDraft(systemPrompt, userPrompt, apiKey)
  if (!draft) {
    return NextResponse.json({ error: { message: 'Draft generation failed', code: 'DRAFT_FAILED' } }, { status: 500 })
  }

  return NextResponse.json({ draft })
}
