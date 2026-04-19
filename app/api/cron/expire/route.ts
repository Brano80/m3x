import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { getServiceClient } from '@/lib/supabase'
import { recomputeAgentCard } from '@/lib/enrich-agent-card'

// Vercel Cron: runs every hour — see vercel.json
// Protected by CRON_SECRET (Vercel sets Authorization: Bearer <secret> automatically)

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim() ?? ''
  // Fail closed: never accept requests when CRON_SECRET is unset. Otherwise the
  // empty-secret comparison below would treat a bare "Bearer " header as valid.
  if (!cronSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured on server' },
      { status: 503 }
    )
  }
  const authHeader = req.headers.get('authorization')
  const expected = `Bearer ${cronSecret}`
  const provided = authHeader ?? ''
  const valid =
    provided.length === expected.length &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  if (!valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const now = new Date().toISOString()

  // Mark expired intents — also pull agent_id so we can refresh each affected
  // agent's card to reflect the new active set.
  const { data: expiredIntents, error: intentError } = await supabase
    .from('intents')
    .update({ status: 'expired' })
    .eq('status', 'active')
    .lt('expires_at', now)
    .select('id, agent_id')

  // Mark expi