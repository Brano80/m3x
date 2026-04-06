import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { verifyAgent } from '@/lib/auth'
import { extractIntentSignals } from '@/lib/extract'
import { embedText } from '@/lib/embed'

export async function POST(req: NextRequest) {
  try {
    const supabase = getServiceClient()

    const agent = await verifyAgent(req, supabase)
    if (!agent) {
      return NextResponse.json(
        { error: { message: 'Invalid or missing bearer token', code: 'UNAUTHORIZED' } },
        { status: 401 }
      )
    }

    const body = await req.json()
    const { side, market, offers, seeking, guardrails = {}, ttl_hours = 72 } = body

    if (!side || !['demand', 'supply'].includes(side)) {
      return NextResponse.json(
        { error: { message: 'side must be "demand" or "supply"', code: 'INVALID_SIDE' } },
        { status: 400 }
      )
    }
    if (!market) {
      return NextResponse.json(
        { error: { message: 'market is required', code: 'MISSING_MARKET' } },
        { status: 400 }
      )
    }
    if (!offers || !seeking) {
      return NextResponse.json(
        { error: { message: 'offers and seeking are required in the request body', code: 'MISSING_INTENT' } },
        { status: 400 }
      )
    }

    const offersText = typeof offers === 'string' ? offers : (offers.description ?? JSON.stringify(offers))
    const seekingText = typeof seeking === 'string' ? seeking : (seeking.description ?? JSON.stringify(seeking))

    const raw_packet = { agent_id: agent.did, side, market, offers, seeking, guardrails }
    const expires_at = new Date(Date.now() + ttl_hours * 60 * 60 * 1000).toISOString()

    // Stage 1 — Extract signals (Haiku)
    const signals = await extractIntentSignals(offersText, seekingText, market)

    // Stage 2 — Embed (HuggingFace)
    const vector = await embedText(`${offersText} ${seekingText}`)

    // Stage 3 — Store
    const { data: intent, error } = await supabase
      .from('intents')
      .insert({
        agent_id: agent.id,
        side,
        market,
        intent_type: signals?.intent_type ?? null,
        raw_packet,
        embedding: vector ? `[${vector.join(',')}]` : null,
        guardrails,
        expires_at,
      })
      .select('id, side, market, intent_type, status, expires_at, created_at')
      .single()

    if (error) throw error

    await supabase
      .from('agents')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', agent.id)

    return NextResponse.json({
      intent,
      signals_extracted: !!signals,
      embedded: !!vector,
      message: 'Intent posted.',
    }, { status: 201 })

  } catch (err: any) {
    console.error('[intent]', err)
    return NextResponse.json(
      { error: { message: err.message ?? 'Internal server error', code: 'SERVER_ERROR' } },
      { status: 500 }
    )
  }
}
