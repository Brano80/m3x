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

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

// Generate a conversational opening message from the supply-side agent
async function generateOpeningMessage(
  supplyHandle: string,
  demandHandle: string,
  supplyPacket: any,
  demandPacket: any
): Promise<string> {
  const prompt = `You are an AI agent acting on behalf of @${supplyHandle} on M3X, a private agent matching network.

You have just been matched with @${demandHandle}. Here is what you offer:
${JSON.stringify(supplyPacket?.offers ?? supplyPacket, null, 2)}

Here is what the other party is looking for (infer from this, do not quote it directly):
${JSON.stringify(demandPacket?.seeking ?? demandPacket, null, 2)}

Write a short, natural opening message to @${demandHandle} as if you are their agent:
- Start with "Hi @${demandHandle},"
- Mention what you have that matches their need — be specific (include details like price, location, size if available)
- Ask 1 relevant qualifying question to understand their specific needs better
- Max 3 sentences, conversational tone, no corporate language
- Do NOT mention M3X, matching scores, or that this is automated

Reply with ONLY the message text, nothing else.`

  try {
    if (process.env.GEMINI_API_KEY) {
      const res = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 512, temperature: 0.7 },
        }),
      })
      if (res.ok) {
        const data = await res.json()
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
        if (text) return text
      }
    }
  } catch { /* fall through to Anthropic */ }

  // Fallback: Anthropic Claude Haiku
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
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

  // Auto-generate opening message from the supply-side agent
  try {
    if (matchData?.intent_a_id && matchData?.intent_b_id) {
      const [{ data: intentA }, { data: intentB }] = await Promise.all([
        supabase.from('intents').select('id, side, raw_packet, agent_id').eq('id', matchData.intent_a_id).single(),
        supabase.from('intents').select('id, side, raw_packet, agent_id').eq('id', matchData.intent_b_id).single(),
      ])

      const supplyIntent = intentA?.side === 'supply' ? intentA : intentB
      const demandIntent = intentA?.side === 'demand' ? intentA : intentB

      if (supplyIntent && demandIntent) {
        const supplyAgentId = supplyIntent.agent_id
        const supplyHandle = supplyAgentId === agent.id ? agent.handle : otherAgent.handle
        const demandHandle = supplyAgentId === agent.id ? otherAgent.handle : agent.handle

        const openingMsg = await generateOpeningMessage(
          supplyHandle,
          demandHandle,
          supplyIntent.raw_packet,
          demandIntent.raw_packet
        )

        if (openingMsg) {
          // Get the session id
          const { data: session } = await supabase
            .from('negotiation_sessions')
            .select('id')
            .eq('handshake_id', handshake_id)
            .single()

          if (session) {
            await supabase.from('negotiation_messages').insert({
              session_id: session.id,
              sender_id: supplyAgentId,
              content: openingMsg,
              status: 'sent',
            })
            await supabase
              .from('negotiation_sessions')
              .update({ last_message_at: new Date().toISOString() })
              .eq('id', session.id)
          }
        }
      }
    }
  } catch (e) {
    console.error('[handshake/accept] opening message error:', e)
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
