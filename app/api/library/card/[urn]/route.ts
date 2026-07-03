// GET /api/library/card/:urn — full canonical card JSON (schema v0.2)
// Public. Cards are the public directory surface — no auth required.
// PRIVACY: reads library.cards ONLY — never intents/agents/matches/handshakes.

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

const URN_RE = /^urn:air:[a-z0-9.-]{1,128}:(business|agent|tool):[a-z0-9-]{1,128}$/

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ urn: string }> }
) {
  const { urn: rawUrn } = await params
  const urn = decodeURIComponent(rawUrn)

  if (!URN_RE.test(urn)) {
    return NextResponse.json(
      { error: { message: 'Invalid URN format', code: 'INVALID_URN' } },
      { status: 400 }
    )
  }

  const supabase = getServiceClient()
  const { data, error } = await supabase
    .schema('library')
    .from('cards')
    .select(
      'schema_version, type, urn, domain, name, one_liner, category, capabilities, serves_markets, customer_types, entity_size, industries, integrations, languages, credentials, pricing, claims, endpoints, callable, identity, trust, meta'
    )
    .eq('urn', urn)
    .maybeSingle()

  if (error) {
    return NextResponse.json(
      { error: { message: error.message, code: 'LOOKUP_FAILED' } },
      { status: 500 }
    )
  }
  if (!data) {
    return NextResponse.json(
      { error: { message: 'Card not found', code: 'CARD_NOT_FOUND' } },
      { status: 404 }
    )
  }

  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' },
  })
}
