import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { verifyAgent } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const supabase = getServiceClient()
  const agent = await verifyAgent(req, supabase)
  if (!agent) {
    return NextResponse.json(
      { error: { message: 'Invalid or missing bearer token', code: 'UNAUTHORIZED' } },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(req.url)
  const tier = searchParams.get('tier')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 100)

  let query = supabase
    .from('matches')
    .select(`
      id, score, tier, state, score_details, created_at, expires_at,
      intent_a:intents!intent_a_id(id, side, market, intent_type),
      intent_b:intents!intent_b_id(id, side, market, intent_type),
      agent_a:agents!agent_a_id(id, handle, did, trust_score, capabilities, markets),
      agent_b:agents!agent_b_id(id, handle, did, trust_score, capabilities, markets)
    `)
    .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`)
    .gt('expires_at', new Date().toISOString())
    .order('score', { ascending: false })
    .limit(limit)

  if (tier) query = query.eq('tier', tier)

  const { data: matches, error } = await query

  if (error) {
    return NextResponse.json(
      { error: { message: error.message, code: 'DB_ERROR' } },
      { status: 500 }
    )
  }

  // Strip raw_packet from the matched agent — dark pool privacy
  const sanitized = (matches ?? []).map(m => {
    const isA = (m.agent_a as any)?.id === agent.id
    const matched_agent = isA ? m.agent_b : m.agent_a
    const my_intent = isA ? m.intent_a : m.intent_b
    const their_intent = isA ? m.intent_b : m.intent_a
    return {
      id: m.id,
      score: m.score,
      tier: m.tier,
      state: m.state,
      score_details: m.score_details,
      created_at: m.created_at,
      expires_at: m.expires_at,
      my_intent,
      their_intent,
      matched_agent  // only public fields — no raw intent text
    }
  })

  return NextResponse.json({ matches: sanitized, count: sanitized.length })
}
