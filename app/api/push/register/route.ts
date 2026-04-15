// POST /api/push/register — store FCM token for the authenticated agent
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { verifyAgent } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const supabase = getServiceClient()
  const agent = await verifyAgent(req, supabase)
  if (!agent) {
    return NextResponse.json(
      { error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } },
      { status: 401 }
    )
  }

  const { fcm_token } = await req.json()
  if (!fcm_token || typeof fcm_token !== 'string') {
    return NextResponse.json(
      { error: { message: 'fcm_token required', code: 'BAD_REQUEST' } },
      { status: 400 }
    )
  }

  const { error } = await supabase
    .from('agents')
    .update({ fcm_token })
    .eq('id', agent.id)

  if (error) {
    return NextResponse.json(
      { error: { message: error.message, code: 'DB_ERROR' } },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}

// DELETE /api/push/register — unregister (e.g. on logout)
export async function DELETE(req: NextRequest) {
  const supabase = getServiceClient()
  const agent = await verifyAgent(req, supabase)
  if (!agent) {
    return NextResponse.json(
      { error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } },
      { status: 401 }
    )
  }

  await supabase.from('agents').update({ fcm_token: null }).eq('id', agent.id)
  return NextResponse.json({ ok: true })
}
