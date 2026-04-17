import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

// Vercel Cron: runs every hour — see vercel.json
// Protected by CRON_SECRET (Vercel sets Authorization: Bearer <secret> automatically)

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET ?? ''
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

  return NextResponse.json({
    intents_expired: expiredIntents?.length ?? 0,
    matches_expired: expiredMatches?.length ?? 0,
    ran_at: now
  })
}
