// POST /api/conversations/[id]/draft
// Gemini reads conversation history + original Demand Packet context
// and generates a reply suggestion for human review before sending.

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { verifyAgent } from '@/lib/auth'
import { geminiConversational } from '@/lib/gemini'
import Anthropic from '@anthropic-ai/sdk'

const haiku = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

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

  // Fetch match briefing — tells us exactly what the other party wants
  const { data: matchBriefingMsg } = await supabase
    .from('negotiation_messages')
    .select('content')
    .eq('session_id', id)
    .eq('status', 'briefing')
    .eq('recipient_id', agent.id)
    .maybeSingle()

  // Build context for Gemini
  const intentContext = myIntent
    ? `Your role: ${myIntent.side} in the ${myIntent.market} market.
Your full intent (use ONLY these facts — never invent details):
${JSON.stringify(myIntent.raw_packet ?? {}, null, 2)}`
    : 'No active intent on file.'

  const briefingContext = matchBriefingMsg?.content
    ? `Match briefing (what you know about the other party):
${matchBriefingMsg.content}`
    : ''

  const conversationHistory = chronological.length
    ? chronological.map(m => `${m.sender_id === agent.id ? 'You' : `@${otherAgent?.handle ?? 'them'}`}: ${m.content}`).join('\n')
    : 'No messages yet — this is the opening message.'

  const systemPrompt = `You are an AI agent acting on behalf of a user on M3X, a private agent matching network.
Draft a natural, conversational reply based on the intent context and conversation history.
Be direct and specific — reference actual details from the conversation and the match briefing. No corporate language, no fluff, no emojis.
Write 2-4 complete sentences. Always finish the last sentence fully — never cut off mid-sentence.
The human will review and edit before sending.`

  const userPrompt = `Context about my agent:
${intentContext}
${briefingContext ? `\n${briefingContext}` : ''}

Other agent: @${otherAgent?.handle ?? 'unknown'}

Conversation so far:
${conversationHistory}

Draft a reply from my agent's perspective.`

  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`
  let draft: string | null = null

  // Try Gemini first
  if (process.env.GEMINI_API_KEY) {
    try {
      draft = await geminiConversational(fullPrompt, process.env.GEMINI_API_KEY)
    } catch (e) {
      console.error('[draft] Gemini failed:', e)
    }
  }

  // Fallback to Haiku
  if (!draft && process.env.ANTHROPIC_API_KEY) {
    try {
      const res = await haiku.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{ role: 'user', content: fullPrompt }],
      })
      draft = res.content[0].type === 'text' ? res.content[0].text.trim() : null
    } catch (e) {
      console.error('[draft] Haiku fallback failed:', e)
    }
  }

  if (!draft) {
    return NextResponse.json({ error: { message: 'Draft generation failed', code: 'DRAFT_FAILED' } }, { status: 500 })
  }

  return NextResponse.json({ draft })
}
