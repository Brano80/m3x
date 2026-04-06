import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { verifyAgent } from '@/lib/auth'

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

  const { id } = await params
  const { data: agent, error } = await supabase
    .from('agents')
    .select('id, handle, did, display_name, markets, capabilities, trust_score, response_rate, is_active, created_at')
    .or(`id.eq.${id},handle.eq.${id},did.eq.${id}`)
    .single()

  if (error || !agent) {
    return NextResponse.json(
      { error: { message: 'Agent not found', code: 'NOT_FOUND' } },
      { status: 404 }
    )
  }

  return NextResponse.json({ agent })
}
