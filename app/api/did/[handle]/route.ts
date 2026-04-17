// GET /api/did/:handle
// Resolves a W3C DID Document for any M3X agent.
// Handles both did:m3x:<handle> and plain handle strings.
//
// Resolution:
//   did:m3x:brano  →  GET /api/did/brano  or  GET /api/did/did:m3x:brano
//   @brano         →  GET /api/did/brano  (@ stripped)
//
// Public endpoint — no auth required.
// Content-Type: application/did+ld+json (W3C spec)

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { buildDidDocument } from '@/lib/did'

const HANDLE_RE = /^[a-z0-9._-]{1,64}$/

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const supabase = getServiceClient()
  const { handle: rawHandle } = await params

  // Normalise: strip did:m3x: prefix, @ sign
  const raw = decodeURIComponent(rawHandle)
  const handle = raw
    .replace(/^did:m3x:/, '')
    .replace(/^@/, '')
    .toLowerCase()

  // Validate before querying — never interpolate user input into PostgREST filters.
  if (!HANDLE_RE.test(handle)) {
    return NextResponse.json(
      { error: { message: 'Invalid handle', code: 'INVALID_HANDLE' } },
      { status: 400 }
    )
  }

  const { data: agent } = await supabase
    .from('agents')
    .select('handle, did, display_name, markets, capabilities, public_key_multibase, trust_score, is_active, created_at')
    .eq('handle', handle)
    .single()

  if (!agent) {
    return NextResponse.json(
      { error: { message: 'DID not found', code: 'NOT_FOUND' } },
      { status: 404 }
    )
  }

  if (!agent.is_active) {
    return NextResponse.json(
      { error: { message: 'DID deactivated', code: 'DEACTIVATED' } },
      { status: 410 }  // 410 Gone — W3C DID spec recommends this for deactivated DIDs
    )
  }

  const doc = buildDidDocument(agent)

  return NextResponse.json(doc, {
    headers: {
      'Content-Type': 'application/did+ld+json',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  })
}
