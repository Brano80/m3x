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

  return NextResponse.json({ intents: data ?? [] })
}
