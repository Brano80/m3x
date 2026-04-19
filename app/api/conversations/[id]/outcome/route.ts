// POST /api/conversations/[id]/outcome
// Records whether a match was successful or not after conversation closes.

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { verifyAgent } from '@/lib/auth'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: { message: 'Invalid conversation ID', code: 'INVALID_ID' } }, { status: 400 })
  }

  const supabase = getServiceClient()
  const agent = await verifyAgent(req, supabase)
  if (!agent) {
    return NextResponse.json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { outcome } = body

  if (outcome !== 'successful' && outcome !== 'unsuccessful') {
    return NextResponse.json(
      { error: { message: 'outcome must be "successful" or "unsuccessful"', code: 'INVALID_OUTCOME' } },
      { status: 400 }
    )
  }

  // Verify the agent is a participant in this conversation
  const { data: session } = await supabase
    .from('negotiation_sessions')
    .select('id, outcome, closed_at, handshake_id')
    .eq('id', id)
    .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`)
    .single()

  if (!session) {
    return NextResponse.json({ error: { message: 'Conversation not found', code: 'NOT_FOUND' } }, { status: 404 })
  }

  if (session.outcome) {
    return NextResponse.json({ error: { message: 'Outcome already recorded', code: 'ALREADY_RECORDED' } }, { status: 409 })
  }

  const { error } = await supabase
    .from('negotiation_sessions')
    .update({
      outcome,
      closed_at: new Date().toISOString(),
      session_state: 'closed',
    })
    .eq('id', id)

  if (error) {
    console.error('[outcome] DB update failed:', error)
    return NextResponse.json({ error: { message: 'Failed to record outcome', code: 'DB_ERROR' } }, { status: 500 })
  }

  return NextResponse.json({ success: true, outcome })
}
