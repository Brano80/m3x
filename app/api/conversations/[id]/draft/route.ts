// POST /api/conversations/[id]/draft
// Gemini reads conversation history + original Demand Packet context
// and generates a reply suggestion for human review before sending.

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { verifyAgent } from '@/lib/auth'
import { geminiConversational } from '@/lib/gemini'
import Anthropic from '@anthropic-ai/sdk'

const haiku = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

function safeIntentSummary(intent: any): string {
  const p = intent?.raw_packet ?? {}
  const offers = p?.offers ?? {}
  const seeking = p?.seeking ?? {}
  const guardrails = p?.guardrails ?? {}
  // Handle both string format (MCP) and object format (structured packet)
  const offersText = typeof p.offers === 'string' ? p.offers.slice(0, 300)
    : (offers.description ? String(offers.description).slice(0, 300) : null)
  const seekingText = typeof p.seeking === 'string' ? p.seeking.slice(0, 300)
    : (seeking.description ? String(seeking.description).slice(0, 300) : null)
  const lines = [
    `Role: ${intent.side} in the ${intent.market} market`,
    `Intent type: ${intent.intent_type}`,
    offersText ? `Offering: ${offersText}` : null,
    seekingText ? `Seeking: ${seekingText}` : null,
    seeking.budget_range ? `Budget: ${String(seeking.budget_range).slice(0, 50)}` : null,
    seeking.timeline ? `Timeline: ${String(seeking.timeline).slice(0, 50)}` : null,
    guardrails.min_trust_score != null ? `Min trust score required: ${guardrails.min_trust_score}` : null,
    Array.isArray(seeking.geography) ? `Geography: ${seeking.geography.slice(0, 5).join(', ')}` : null,
  ].filter(Boolean)
  return lines.join('\n')
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

  // Fetch the intent tied to THIS match — not just any active intent
  const { data: handshake } = await supabase
    .from('handshakes')
    .select('match_id')
    .eq('id', session.handshake_id)
    .single()

  let myIntent: any = null
  if (handshake?.match_id) {
    const { data: match } = await supabase
      .from('matches')
      .select('intent_a_id, intent_b_id, agent_a_id')
      .eq('id', handshake.match_id)
      .single()
    if (match) {
      const myIntentId = match.agent_a_id === agent.id ? match.intent_a_id : match.intent_b_id
      const { data } = await supabase
        .from('intents')
        .select('side, market, intent_type, raw_packet')
        .eq('id', myIntentId)
        .single()
      myIntent = data
    }
  }

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
    ? `Your role: ${myIntent.side} in the ${myIntent.market} market.\n${safeIntentSummary(myIntent)}`
    : 'No active intent on file.'

  const briefingContext = matchBriefingMsg?.content
    ? `Match briefing (what you know about the other party):
${matchBriefingMsg.content}`
    : ''

  const conversationHistory = chronological.length
    ? chronological.map(m => `${m.sender_id === agent.id ? 'You' : `@${otherAgent?.handle ?? 'them'}`}: ${String(m.content).slice(0, 300)}`).join('\n')
    : 'No messages yet — this is the opening message.'

  // Determine conversation phase based on message count
  const myMessageCount = chronological.filter(m => m.sender_id === agent.id).length
  const totalMessages = chronological.length

  let phaseInstruction: string
  if (totalMessages === 0) {
    phaseInstruction = `This is the opening message. Introduce yourself briefly, reference what you're looking for, and ask one specific qualifying question to move things forward.`
  } else if (myMessageCount <= 1) {
    phaseInstruction = `Early stage (round 1-2). Share one key piece of relevant information about your situation and ask one specific question to understand their position better. Be direct and concrete.`
  } else if (myMessageCount <= 3) {
    phaseInstruction = `Mid stage (round 2-3). You now have some context on each other. Start converging — summarize where you agree, identify the key open question, and signal whether you're interested in taking this further.`
  } else {
    phaseInstruction = `Exit stage (round 4+). You've exchanged enough context. If there's genuine mutual interest, propose a concrete next step: either exchange contact details directly (email, phone, calendar link) or suggest a specific meeting time. If it's not a fit, politely close the conversation. Do not keep the dialogue going without a concrete commitment.`
  }

  const systemPrompt = `You are an AI agent acting on behalf of a user on M3X, a private matching network for AI agents.
Your goal: help two matched parties determine within ~5 exchanges whether they want to connect directly and exchange contact details.
Be direct and specific — reference actual details from the conversation and the match briefing. No corporate language, no fluff, no emojis.
Write 2-4 complete sentences. Always finish the last sentence fully — never cut off mid-sentence.
The human will review and edit before sending.

Phase instruction: ${phaseInstruction}`

  const userPrompt = `Context about my agent:
${intentContext}
${briefingContext ? `\n${briefingContext}` : ''}

Other agent: @${otherAgent?.handle ?? 'unknown'}
Messages exchanged so far: ${totalMessages} total, ${myMessageCount} from me.

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
