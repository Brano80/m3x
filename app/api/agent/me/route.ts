import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { verifyAgent } from '@/lib/auth'
import { isSafeWebhookUrl } from '@/lib/ssrf'

const MAX_DISPLAY_NAME_LEN = 100
const MAX_TAGS = 20
const MAX_TAG_LEN = 64

function isValidStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.length <= MAX_TAGS &&
    v.every((s) => typeof s === 'string' && s.length > 0 && s.length <= MAX_TAG_LEN)
}

export async function GET(req: NextRequest) {
  const supabase = getServiceClient()
  const agent = await verifyAgent(req, supabase)
  if (!agent) {
    return NextResponse.json(
      { error: { message: 'Invalid or missing bearer token', code: 'UNAUTHORIZED' } },
      { status: 401 }
    )
  }

  const { data, error } = await supabase
    .from('agents')
    .select('id, handle, did, display_name, markets, capabilities, trust_score, response_rate, is_active, auto_reply, created_at, last_active_at')
    .eq('id', agent.id)
    .single()

  if (error) {
    return NextResponse.json(
      { error: { message: error.message, code: 'DB_ERROR' } },
      { status: 500 }
    )
  }

  return NextResponse.json({ agent: data })
}

export async function PATCH(req: NextRequest) {
  const supabase = getServiceClient()
  const agent = await verifyAgent(req, supabase)
  if (!agent) {
    return NextResponse.json(
      { error: { message: 'Invalid or missing bearer token', code: 'UNAUTHORIZED' } },
      { status: 401 }
    )
  }

  const body = await req.json()
  const allowed = ['display_name', 'markets', 'capabilities', 'webhook_url', 'auto_reply']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key]
  }

  if (!Object.keys(updates).length) {
    return NextResponse.json(
      { error: { message: 'No valid fields to update', code: 'BAD_REQUEST' } },
      { status: 400 }
    )
  }

  if (updates.display_name !== undefined && updates.display_name !== null &&
      (typeof updates.display_name !== 'string' || updates.display_name.length > MAX_DISPLAY_NAME_LEN)) {
    return NextResponse.json(
      { error: { message: `display_name must be a string of ${MAX_DISPLAY_NAME_LEN} chars or fewer`, code: 'INVALID_DISPLAY_NAME' } },
      { status: 400 }
    )
  }

  if (updates.markets !== undefined && updates.markets !== null && !isValidStringArray(updates.