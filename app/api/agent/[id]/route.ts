import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { verifyAgent } from '@/lib/auth'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const HANDLE_RE = /^[a-z0-9._-]{1,64}$/
const DID_RE = /^did:m3x:[a-z0-9._-]{1,64}$/

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getServiceClient()
  const caller = await verifyAgent(req, supabase)
  if (!caller) {
    return NextResponse.json(
      { error: { message: 'Invalid or missing bearer token', code: 'UNAUTHORIZED' } },
      { status: 401 }
    )
  }

  const { id: rawId } = await params
  const id = rawId.toLowerCase()

  // Validate param matches a known identifier format and select the column.
  // Never interpolate user input into a PostgREST filter string (injection risk).
  let query = supabase
    .from('agents')
    .select('id, handle, did, display_name, markets, capabilities, trust_score, response_rate, is_active, created_at, last_active_at')

  if (UUID_RE.test(id)) {
    query = query.eq('id', id)
  } else if (DID_RE.test(id)) {
    query = query.eq('did', id)
  } else if (HANDLE_RE.test(id)) {
    query = query.eq('handle', id)
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

  return NextResponse.json({
    agent_id: agent.did ?? agent.id,
    handle: agent.handle,
    display_name: agent.display_name,
    markets: agent.markets,
    capabilities: agent.capabilities,
    trust_score: agent.trust_score,
    response_rate: agent.response_rate,
    active: agent.is_active,
    registered_at: agent.created_at,
    last_active_at: agent.last_active_at,
  })
}
