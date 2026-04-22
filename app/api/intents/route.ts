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
  const intentIds: string[] = intents.map((i: any) => i.id)
  // Count successful connections per intent (not just a boolean — one intent
  // can be involved in multiple successful matches).
  const connectedIntentCount = new Map<string, number>()

  if (intentIds.length > 0) {
    // Step 1: get all matches involving this agent
    const { data: matchRows } = await supabase
      .from('matches')
      .select('id, intent_a_id, intent_b_id')
      .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`)

    const matchRows_ = matchRows ?? []
    const matchIds = matchRows_.map((m: any) => m.id)

    if (matchIds.length > 0) {
      // Step 2: get handshakes for those matches
      const { data: handshakeRows } = await supabase
        .from('handshakes')
        .select('id, match_id')
        .in('match_id', matchIds)

      const handshakeRows_ = handshakeRows ?? []
      const handshakeIds = handshakeRows_.map((h: any) => h.id)
      const handshakeMatchMap: Record<string, string> = Object.fromEntries(
        handshakeRows_.map((h: any) => [h.id, h.match_id])
      )

      if (handshakeIds.length > 0) {
        // Step 3: find sessions with successful outcome
        const { data: sessionRows } = await supabase
          .from('negotiation_sessions')
          .select('handshake_id')
          .in('handshake_id', handshakeIds)
          .eq('outcome', 'successful')

        for (const session of sessionRows ?? []) {
          const matchId = handshakeMatchMap[session.handshake_id]
          const match = matchRows_.find((m: any) => m.id === matchId)
          if (match) {
            if (intentIds.includes(match.intent_a_id)) {
              connectedIntentCount.set(match.intent_a_id, (connectedIntentCount.get(match.intent_a_id) ?? 0) + 1)
            }
            if (intentIds.includes(match.intent_b_id)) {
              connectedIntentCount.set(match.intent_b_id, (connectedIntentCount.get(match.intent_b_id) ?? 0) + 1)
            }
          }
        }
      }
    }
  }

  const result = intents.map((i: any) => ({
    ...i,
    connected: connectedIntentCount.has(i.id),
    connected_count: connectedIntentCount.get(i.id) ?? 0,
  }))

  return NextResponse.json({ intents: result })
}
