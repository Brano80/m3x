import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { recalculateTrust } from '@/lib/trust'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const HANDLE_RE = /^[a-z0-9._-]{1,64}$/
const DID_RE = /^did:m3x:[a-z0-9._-]{1,64}$/

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agent_id: string }> }
) {
  const supabase = getServiceClient()
  const { agent_id: rawAgentId } = await params
  const agent_id = rawAgentId.toLowerCase()

  // Validate param and dispatch to single typed .eq() — never interpolate into PostgREST filter strings
  let query = supabase
    .from('agents')
    .select('id, handle, did, trust_score, response_rate, is_active, created_at, last_active_at')

  if (UUID_RE.test(agent_id)) {
    query = query.eq('id', agent_id)
  } else if (DID_RE.test(agent_id)) {
    query = query.eq('did', agent_id)
  } else if (HANDLE_RE.test(agent_id)) {
    query = query.eq('handle', agent_id)
  } else {
    return NextResponse.json(
      { error: { message: 'Invalid agent identifier', code: 'INVALID_PARAM' } },
      { status: 400 }
    )
  }

  const { data: agent } = await query.single()

  if (!agent) {
    return NextResponse.json(
      { error: { message: 'Agent not found', code: 'NOT_FOUND' } },
      { status: 404 }
    )
  }

  const breakdown = await recalculateTrust(agent.id, supabase)

  return NextResponse.json({
    agent_id: agent.did ?? agent.id,
    handle: agent.handle,
    trust_score: agent.trust_score,
    breakdown,
  })
}
