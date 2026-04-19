// lib/conversation.ts
// Autonomous-but-escalates-before-committing conversation engine.
//
// Flow:
//   incoming message → detectDecision → if info-gathering: auto-reply
//                                      if decision point: escalate to owner
//
// Decision points (agent pauses, owner notified):
//   - price / budget agreement
//   - timeline / deadline commitment
//   - meeting / call scheduling
//   - contract / deal close signals
//   - "yes I'll do it" / "we're in" type confirmations

import Anthropic from '@anthropic-ai/sdk'
import { SupabaseClient } from '@supabase/supabase-js'
import { geminiConversational, geminiStructured } from './gemini'

const haiku = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// Strip raw_packet down to typed scalar fields before injecting into LLM
// prompts. Prevents prompt-injection via attacker-controlled free-text blobs
// inside offers/seeking/market.
function safeIntentSummary(packet: Record<string, unknown> | null): string {
  if (!packet) return ''
  const parts: string[] = []
  if (typeof packet.offers === 'string') parts.push('Offers: ' + packet.offers.slice(0, 300))
  if (typeof packet.seeking === 'string') parts.push('Seeking: ' + packet.seeking.slice(0, 300))
  if (typeof packet.market === 'string') parts.push('Market: ' + packet.market.slice(0, 64))
  return parts.join('\n')
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type DecisionType =
  | 'price_agreement'
  | 'timeline_commitment'
  | 'meeting_scheduling'
  | 'deal_close'
  | 'none'

export interface DecisionResult {
  is_decision_point: boolean
  decision_type: DecisionType
  confidence: number   // 0–1
  summary: string      // one-line explanation for owner
}

export interface AutoReplyResult {
  reply: string
  analysis: string     // brief agent reasoning shown to owner
}

// ─── Decision Detector ────────────────────────────────────────────────────────

export async function detectDecision(
  lastMessage: string,
  conversationHistory: string
): Promise<DecisionResult> {
  const prompt = `You are analyzing a B2B agent conversation on M3X, a private matching network.

Recent conversation:
${conversationHistory}

Latest message to analyze:
"${lastMessage}"

Does this message represent a DECISION POINT that requires human owner approval before the agent commits?

Decision points include:
- Agreeing to a specific price or budget
- Committing to a timeline or deadline
- Scheduling a meeting, call, or demo
- Closing a deal or signing off on terms
- Any explicit commitment or agreement

Return ONLY valid JSON:
{"is_decision_point":false,"decision_type":"none","confidence":0.0,"summary":"brief explanation"}`

  const parse = (text: string): DecisionResult | null => {
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return null
    try { return JSON.parse(m[0]) } catch { return null }
  }

  // Try Gemini structured (fast, no thinking needed for classification)
  if (process.env.GEMINI_API_KEY) {
    try {
      const text = await geminiStructured(prompt, process.env.GEMINI_API_KEY)
      const result = parse(text)
      if (result) return result
    } catch { /* fall through */ }
  }

  // Fallback: Haiku
  try {
    const res = await haiku.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = res.content[0].type === 'text' ? res.content[0].text : ''
    const result = parse(text)
    if (result) return result
  } catch { /* give up */ }

  return { is_decision_point: false, decision_type: 'none', confidence: 0, summary: '' }
}

// ─── Auto-Reply Generator ─────────────────────────────────────────────────────

export async function generateAutoReply(
  myHandle: string,
  otherHandle: string,
  myIntent: any,
  conversationHistory: string
): Promise<AutoReplyResult> {
  const intentCtx = myIntent
    ? `Your role: ${myIntent.side} in the ${myIntent.market} market.
Your intent (THIS IS YOUR ONLY SOURCE OF TRUTH — never invent details outside this):
${safeIntentSummary(myIntent.raw_packet ?? null)}`
    : 'No active intent context — you have no data to share.'

  const prompt = `You are an AI agent acting autonomously on behalf of @${myHandle} on M3X, a private B2B matching network.

${intentCtx}

You are in a conversation with @${otherHandle}.

Conversation so far:
${conversationHistory}

STRICT RULES:
- Only use facts explicitly present in your intent packet above. NEVER invent, assume, or extrapolate details not stated there.
- If asked something not covered by your intent packet, say you'll need to check with your principal.
- DO NOT commit to prices, timelines, meetings, or deals — those need human approval.
- Be direct, professional, human. 2–3 sentences max. No emojis, no corporate fluff.

Reply with a JSON object:
{"reply":"your message here","analysis":"1-sentence note explaining your reasoning"}`

  const parse = (text: string): AutoReplyResult | null => {
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return null
    try {
      const obj = JSON.parse(m[0])
      if (obj.reply && obj.analysis) return obj
      return null
    } catch { return null }
  }

  // Use Gemini conversational (thinking ON) for best quality
  if (process.env.GEMINI_API_KEY) {
    try {
      const text = await geminiConversational(prompt, process.env.GEMINI_API_KEY, 512)
      const result = parse(text)
      if (result) return result
    } catch { /* fall through */ }
  }

  // Fallback: Haiku
  try {
    const res = await haiku.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = res.content[0].type === 'text' ? res.content[0].text : ''
    const result = parse(text)
    if (result) return result
  } catch { /* give up */ }

  return { reply: '', analysis: '' }
}

// ─── Conversation Summarizer ──────────────────────────────────────────────────

export async function summarizeConversation(
  messages: Array<{ sender: string; content: string }>
): Promise<string> {
  if (messages.length === 0) return ''

  const history = messages.map(m => `${m.sender}: ${String(m.content).slice(0, 300)}`).join('\n')

  const prompt = `Summarize this B2B agent conversation in 2–3 sentences. Focus on: what was discussed, what was agreed, what's still open.

Conversation:
${history}

Return only the summary text, no preamble.`

  if (process.env.GEMINI_API_KEY) {
    try {
      const text = await geminiStructured(prompt, process.env.GEMINI_API_KEY, 256)
      if (text) return text
    } catch { /* fall through */ }
  }

  try {
    const res = await haiku.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = res.content[0].type === 'text' ? res.content[0].text.trim() : ''
    if (text) return text
  } catch { /* give up */ }

  return ''
}

// ─── Owner Notification Helper ────────────────────────────────────────────────

export async function notifyOwnerEscalation(
  supabase: SupabaseClient,
  sessionId: string,
  agentId: string,
  decisionResult: DecisionResult,
  pendingReply: string,
  agentAnalysis: string
) {
  await supabase
    .from('negotiation_sessions')
    .update({
      session_state: 'escalated',
      pending_reply: pendingReply,
      agent_analysis: agentAnalysis,
    })
    .eq('id', sessionId)

  // FCM push to owner
  try {
    const { data: agent } = await supabase
      .from('agents')
      .select('fcm_token, handle')
      .eq('id', agentId)
      .single()

    if (agent?.fcm_token) {
      const { sendFcmPush } = await import('./fcm')
      await sendFcmPush(agent.fcm_token, {
        title: '⚠️ Your agent needs a decision',
        body: decisionResult.summary || 'A conversation reached a decision point.',
        url: 'https://m3x.space/inbox',
        tag: 'm3x-escalation',
      })
    }
  } catch { /* non-fatal */ }
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export async function handleIncomingMessage(
  supabase: SupabaseClient,
  sessionId: string,
  incomingContent: string,
  senderId: string,
  myAgentId: string,
  myHandle: string,
  otherHandle: string,
  myIntent: any,
  isAutoReplyEnabled: boolean,
  recentMessages: Array<{ sender_id: string; content: string }>
): Promise<{ action: 'auto_replied' | 'escalated' | 'passive'; reply?: string }> {
  if (!isAutoReplyEnabled) return { action: 'passive' }

  // Build conversation history string — cap each message at 300 chars so a
  // single attacker-controlled message can't dominate the prompt or smuggle
  // injection payloads.
  const history = recentMessages
    .map(m => `${m.sender_id === myAgentId ? `@${myHandle}` : `@${otherHandle}`}: ${String(m.content).slice(0, 300)}`)
    .join('\n')

  const cappedIncoming = String(incomingContent).slice(0, 300)
  const fullHistory = history + `\n@${otherHandle}: ${cappedIncoming}`

  // 1. Detect if this is a decision point
  const decision = await detectDecision(cappedIncoming, fullHistory)

  if (decision.is_decision_point && decision.confidence >= 0.65) {
    // Generate a suggested reply for the owner to approve/edit
    const { reply: suggestedReply, analysis } = await generateAutoReply(
      myHandle, otherHandle, myIntent, fullHistory
    )

    // Update session: escalated state + pending reply
    await notifyOwnerEscalation(supabase, sessionId, myAgentId, decision, suggestedReply, analysis)

    return { action: 'escalated', reply: suggestedReply }
  }

  // 2. Info-gathering — auto-reply autonomously
  const { reply, analysis } = await generateAutoReply(
    myHandle, otherHandle, myIntent, fullHistory
  )

  if (!reply) return { action: 'passive' }

  // Insert the auto-reply message
  await supabase.from('negotiation_messages').insert({
    session_id: sessionId,
    sender_id: myAgentId,
    content: reply,
    status: 'sent',
  })

  // Update session metadata
  const { data: session } = await supabase
    .from('negotiation_sessions')
    .select('auto_reply_count')
    .eq('id', sessionId)
    .single()

  await supabase
    .from('negotiation_sessions')
    .update({
      last_message_at: new Date().t