// GET /api/intents — list the authenticated agent's own intents
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
  const status = searchParams.get('status')

  let query = supabase
    .from('intents')
    .select('id, side, market, intent_type, status, raw_packet, created_at, expires_at')
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (status) query = query.eq('status', status)

  const { data, error } = await query

  if (error) {
    return NextResponse.json(
      { error: { message: error.message, code: 'DB_ERROR' } },
      { status: 500 }
    )
  }

  const intents = data ?? []

  // Find which intents have a successful conversation outcome
  // intent → match → handshake → negotiation_session (outcome = 'successful')
  const intentIds = intents.map((i: any) => i.id)
  let connectedIntentIds = new Set<string>()

  if (intentIds.length > 0) {
    const { data: matches } = await supabase
      .from('matches')
      .select('intent_a_id, intent_b_id, agent_a_id, handshakes(id, negotiation_sessions(outcome))')
      .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`)
      .or(`intent_a_id.in.(${intentIds.join(',')}),intent_b_id.in.(${intentIds.join(',')})`)

    for (const m of matches ?? []) {
      const sessions = (m as any).handshakes?.negotiation_sessions
      const hasSuccess = Array.isArray(sessions)
        ? sessions.some((s: any) => s.outcome === 'successful')
        : sessions?.outcome === 'successful'
      if (hasSuccess) {
        if (intentIds.includes(m.intent_a_id)) connectedIntentIds.add(m.intent_a_id)
        if (intentIds.includes(m.intent_b_id)) connectedIntentIds.add(m.intent_b_id)
      }
    }
  }

  const result = intents.map((i: any) => ({
    ...i,
    connected: connectedIntentIds.has(i.id),
  }))

  return NextResponse.json({ intents: result })
}
