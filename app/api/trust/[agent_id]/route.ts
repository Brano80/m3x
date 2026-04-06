import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { verifyAgent } from '@/lib/auth'

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

  const { agent_id } = await params
  const { data: agent, error } = await supabase
    .from('agents')
    .select('id, handle, did, trust_score, response_rate, is_active, created_at, last_active_at')
    .or(`id.eq.${agent_id},handle.eq.${agent_id},did.eq.${agent_id}`)
    .single()

  if (error || !agent) {
    return NextResponse.json(
      { error: { message: 'Agent not found', code: 'NOT_FOUND' } },
      { status: 404 }
    )
  }

  return NextResponse.json({
    agent_id: agent.did,
    handle: agent.handle,
    trust_score: agent.trust_score,
    response_rate: agent.response_rate,
    is_active: agent.is_active,
    member_since: agent.created_at,
    last_active_at: agent.last_active_at
  })
}
