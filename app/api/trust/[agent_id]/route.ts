import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { verifyAgent } from '@/lib/auth'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const HANDLE_RE = /^[a-z0-9._-]{1,64}$/
const DID_RE = /^did:m3x:[a-z0-9._-]{1,64}$/

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agent_id: string }> }
) {
  const supabase = getServiceClient()
  const caller = await verifyAgent(req, supabase)
  if (!caller) {
    return NextResponse.json(
      { error: { message: 'Invalid or missing bearer token', code: 'UNAUTHORIZED' } },
      { status: 401 }
    )
  }

  const { agent_id: rawAgentId } = await params
  const agent_id = rawAgentId.toLowerCase()

  // Validate param matches a known identifier format and select the column.
  // Never interpolate user input into a PostgREST filter string (injection risk).
  let query = supabase
    .from('agents')
    .select('id, handle, did, trust_score, response_rate, is_active, created_at, last_active_at')

  if (UUID_RE.test(agent_id)) {
    query = query.eq('id', agent_id)
  } else if (DID_RE.test(agent_id)) {
    query = query.eq('did', agent_id)
  } else