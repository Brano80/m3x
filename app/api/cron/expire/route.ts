import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

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

  // Mark expired intents
  const { data: expiredIntents, error: intentError } = await supabase
    .from('intents')
    .update({ status: 'expired' })
    .eq('status', 'active')
    .lt('expires_at', now)
    .select('id')

  // Mark expired matches
  const { data: expiredMatches, error: matchError } = await supabase
    .from('matches')
    .update({ state: 'expired' })
    .in('state', ['discovered', 'notified'])
    .lt('expires_at', now)
    .select('id')

  if (intentError) console.error('[cron/expire] intent error:', intentError)
  if (matchError) console.error('[cron/expire] match error:', matchError)

  // Prune registration_attempts older than 24h — keeps the per-IP rate limit
  // table from growing unbounded. The 1-hour rate window only needs recent
  // rows, so anything past 24h is safe to drop.
  const { error: pruneError } = await supabase
    .from('registration_attempts')
    .delete()
    .lt('created_at', new Date(Date.now() - 86_400_000).toISOString())
  if (pruneError) console.error('[cron/expire] registration_attempts prune error:', pruneError)

  return NextResponse.json({
    intents_expired: expiredIntents?.length ?? 0,
    matches_expired: expiredMatches?.length ?? 0,
    ran_at: now
  })
}
