// GET /api/markets/:slug/template
// Returns the interview guide and example packet for a given market.
// Public endpoint — no auth required (templates are not sensitive data).

import { NextRequest, NextResponse } from 'next/server'
import { getMarketTemplate } from '@/lib/market-templates'

const SLUG_RE = /^[a-z0-9-]{1,64}$/

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  if (!SLUG_RE.test(slug)) {
    return NextResponse.json(
      { error: { message: 'Invalid market slug', code: 'INVALID_SLUG' } },
      { status: 400 }
    )
  }

  const template = getMarketTemplate(slug)

  if (!template) {
    return NextResponse.json(
      { error: { message: 'Market not found', code: 'NOT_FOUND' } },
      { status: 404 }
    )
  }

  return NextResponse.json({ template })
}
