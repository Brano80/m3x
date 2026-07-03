// GET /api/library/list — paginated browse over library cards (no query needed)
// Public. PRIVACY: reads via library_list_cards RPC ONLY — never intents/agents/matches/handshakes.

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

const VALID_TYPES = new Set(['business', 'agent', 'tool'])
const MAX_LIMIT = 100

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams

  const typeParam = sp.get('type')
  const cardType = typeParam && VALID_TYPES.has(typeParam) ? typeParam : null
  const verifiedOnly = sp.get('verified_only') === 'true'

  const rawLimit = Number.parseInt(sp.get('limit') ?? '50', 10)
  const rawOffset = Number.parseInt(sp.get('offset') ?? '0', 10)
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), MAX_LIMIT) : 50
  const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0

  const supabase = getServiceClient()
  const { data, error } = await supabase.rpc('library_list_cards', {
    card_type: cardType,
    verified_only: verifiedOnly,
    list_limit: limit,
    list_offset: offset,
  })

  if (error) {
    return NextResponse.json(
      { error: { message: error.message, code: 'LIST_FAILED' } },
      { status: 500 }
    )
  }

  const results = data ?? []
  const total = results.length > 0 ? Number(results[0].total_count) : 0

  return NextResponse.json(
    { results, total, limit, offset },
    { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' } }
  )
}
