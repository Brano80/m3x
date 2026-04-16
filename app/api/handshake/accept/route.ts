// POST /api/handshake/accept
// Accepts a pending handshake.
// On acceptance: both agents receive each other's webhook URL.
// This is the identity reveal moment — the private pool opens exactly here.

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { verifyAgent } from '@/lib/auth'
import { sendWebhook } from '@/lib/webhook'
import { recalculateTrust } from '@/lib/trust'
import { notifyHandshakeAccepted } from '@/lib/fcm'
import { geminiConversational } from '@/lib/gemini'
import Anthropic from '@anthropic-ai/sdk'

const haiku = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// Generate a match briefing for one specific agent owner.
// Tells them: who they matched with, all details of what the other side has/wants,
// and how it lines up with their own intent. Written like a personal assistant briefing.
async function generateMatchBriefing(
  myHandle: string,
  theirHandle: string,
  myPacket: any,
  theirPacket: any
): Promise<string> {
  const prompt = `You are a personal assistant briefing @${myHandle} about a new connection that just opened.

Here is what @${myHandle} posted (their own intent — what they are looking for or offering):
${JSON.stringify(myPacket ?? {}, null, 2)}

Here is what @${theirHandle} posted (the person they just connected with):
${JSON.stringify(theirPacket ?? {}, null, 2)}

Write a concise briefing for @${myHandle} in plain, natural language. Cover:
- Who they connected with and what that person has or is looking for — include ALL specific details (price, size, location, timeline, requirements, conditions — everything that's in their data)
- A brief note on how it fits with what @${myHandle} is after

Rules:
- Write in second person: "You connected with @${theirHandle}..."
- Include every concrete detail from @${theirHandle}'s data — do not omit anything specific
- Do not invent or assume any detail not explicitly present in the data above
- Do not mention matching scores, algorithms, or that this is automated
- Do not use corporate language or bullet points — write in flowing sentences
- Keep it under 120 words
- End with a simple line like "Send them a message to get started."

Reply with ONLY the briefing text, nothing else.`

  try {
    if (process.env.GEMINI_API_KEY) {
      const text = await geminiConversational(prompt, process.env.GEMINI_API_KEY, 512)
      if (text?.trim()) return text.trim()
    }
  } catch { /* fall through */ }

  try {
    const res = await haiku.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = res.content[0].type === 'text' ? res.content[0].text.trim() : ''
    if (text) return text
  } catch { /* give up */ }

  return ''
}

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

  // Fetch handshake — agent must be a participant but NOT the initiator
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

  if (handshake.initiated_by === agent.id) {
    return NextResponse.json(
      { error: { message: 'You initiated this handshake — wait for the other agent to accept', code: 'CANNOT_ACCEPT_OWN' } },
      { status: 400 }
    )
  }

  // Get both agents with webhook URLs
  const otherAgentId = handshake.agent_a_id === agent.id ? handshake.agent_b_id : handshake.agent_a_id

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://m3x.space'

  const [{ data: otherAgent }, { data: matchData }] = await Promise.all([
    supabase.from('agents').select('id, handle, did, webhook_url, a2a_endpoint, capabilities, markets, trust_score, fcm_token').eq('id', otherAgentId).single(),
    supabase.from('matches').select('score, tier, intent_a_id, intent_b_id, agent_a_id').eq('id', handshake.match_id).single(),
  ])

  if (!otherAgent) {
    return NextResponse.json(
      { error: { message: 'Other agent not found', code: 'AGENT_NOT_FOUND' } },
      { status: 404 }
    )
  }

  // Activate handshake
  const { error } = await supabase
    .from('handshakes')
    .update({ state: 'active' })
    .eq('id', handshake_id)

  if (error) {
    return NextResponse.json(
      { error: { message: error.message, code: 'DB_ERROR' } },
      { status: 500 }
    )
  }

  // Update match state
  await supabase
    .from('matches')
    .update({ state: 'accepted' })
    .eq('id', handshake.match_id)

  // Recalculate trust scores — both agents responded positively
  await Promise.all([
    recalculateTrust(agent.id, supabase, 'handshake_accepted'),
    recalculateTrust(otherAgentId, supabase, 'handshake_accepted'),
  ])

  // IDENTITY REVEAL — send each agent the other's webhook URL
  const revealPayload = (myAgent: any, theirAgent: any) => ({
    event: 'handshake.active',
    handshake_id,
    match_id: handshake.match_id,
    score: matchData?.score,
    tier: matchData?.tier,
    connected_agent: {
      did: theirAgent.did,
      handle: theirAgent.handle,
      capabilities: theirAgent.capabilities ?? [],
      markets: theirAgent.markets ?? [],
      trust_score: theirAgent.trust_score,
      webhook_url: theirAgent.webhook_url,
      a2a_endpoint: theirAgent.a2a_endpoint ?? null,
      a2a_card_url: `${APP_URL}/api/a2a/${theirAgent.handle}`,
      did_document_url: `${APP_URL}/api/did/${theirAgent.handle}`,
    },
    message: 'Handshake accepted. You can now communicate directly via webhook.',
  })

  const webhookPromises = []
  if (agent.webhook_url) {
    webhookPromises.push(sendWebhook(agent.webhook_url, revealPayload(agent, otherAgent)))
  }
  if (otherAgent.webhook_url) {
    webhookPromises.push(sendWebhook(otherAgent.webhook_url, revealPayload(otherAgent, agent)))
  }
  await Promise.allSettled(webhookPromises)

  // FCM push — notify initiator their handshake was accepted
  notifyHandshakeAccepted(otherAgent, agent.handle)

  // Auto-create negotiation session
  await supabase.from('negotiation_sessions').upsert({
    handshake_id: handshake_id,
    agent_a_id: handshake.initiated_by,
    agent_b_id: agent.id,
  }, { onConflict: 'handshake_id', ignoreDuplicates: true })

  // Inject match briefings — one for each agent owner.
  // Each briefing is a private system message (sender_id = null) that covers
  // all details of the match from that owner's perspective.
  try {
    if (matchData?.intent_a_id && matchData?.intent_b_id) {
      const [{ data: intentA }, { data: intentB }, { data: session }] = await Promise.all([
        supabase.from('intents').select('id, side, raw_packet, agent_id').eq('id', matchData.intent_a_id).single(),
        supabase.from('intents').select('id, side, raw_packet, agent_id').eq('id', matchData.intent_b_id).single(),
        supabase.from('negotiation_sessions').select('id').eq('handshake_id', handshake_id).single(),
      ])

      if (intentA && intentB && session) {
        // Determine which intent belongs to which agent
        const myIntent    = intentA.agent_id === agent.id      ? intentA : intentB
        const theirIntent = intentA.agent_id === agent.id      ? intentB : intentA
        const myHandle    = agent.handle
        const theirHandle = otherAgent.handle

        // Generate briefings for both sides in parallel
        const [briefingForMe, briefingForThem] = await Promise.all([
          generateMatchBriefing(myHandle,    theirHandle, myIntent.raw_packet,    theirIntent.raw_packet),
          generateMatchBriefing(theirHandle, myHandle,    theirIntent.raw_packet, myIntent.raw_packet),
        ])

        // Insert as system messages (sender_id = null, status = 'briefing')
        // The UI renders these as neutral cards, not chat bubbles.
        const inserts = []
        if (briefingForMe)   inserts.push({ session_id: session.id, sender_id: null, recipient_id: agent.id,       content: briefingForMe,   status: 'briefing' })
        if (briefingForThem) inserts.push({ session_id: session.id, sender_id: null, recipient_id: otherAgent.id,  content: briefingForThem, status: 'briefing' })

        if (inserts.length > 0) {
          await supabase.from('negotiation_messages').insert(inserts)
          await supabase
            .from('negotiation_sessions')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', session.id)
        }
      }
    }
  } catch (e) {
    console.error('[handshake/accept] briefing error:', e)
    // Non-fatal — handshake is already active
  }

  return NextResponse.json({
    handshake: { id: handshake_id, state: 'active' },
    connected_agent: {
      did: otherAgent.did,
      handle: otherAgent.handle,
      capabilities: otherAgent.capabilities ?? [],
      markets: otherAgent.markets ?? [],
      trust_score: otherAgent.trust_score,
      webhook_url: otherAgent.webhook_url,
      a2a_endpoint: otherAgent.a2a_endpoint ?? null,
      a2a_card_url: `${APP_URL}/api/a2a/${otherAgent.handle}`,
      did_document_url: `${APP_URL}/api/did/${otherAgent.handle}`,
    },
    message: 'Handshake active. Both agents have been notified with each other\'s webhook URL.',
  })
}
