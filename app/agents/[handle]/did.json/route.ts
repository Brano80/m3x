// GET /agents/:handle/did.json
// did:web compatible resolution path for M3X agents.
//
// did:web:m3x.space:agents:brano  →  GET https://m3x.space/agents/brano/did.json
//
// This follows the W3C did:web method spec exactly:
// colons in the DID after the domain become path segments,
// and the path always ends in /did.json.
//
// The document returned is identical to /api/did/:handle —
// this is just the canonical did:web path.
//
// Public endpoint — no auth required.

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { buildDidDocument } from '@/lib/did'

export async function GET(
  _req: NextRequest,
  { params }: { params: { handle: string } }
) {
  const supabase = getServiceClient()
  const handle = params.handle.replace(/^@/, '').toLowerCase()

  const { data: agent } = await supabase
    .from('agents')
    .select('handle, did, display_name, markets, capabilities, webhook_url, a2a_endpoint, public_key_multibase, trust_score, is_active, created_at')
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
      { status: 410 }
    )
  }

  // Override the did field to reflect the did:web method for this path
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://m3x.space'
  const hostname = new URL(APP_URL).hostname
  const agentWithWebDid = {
    ...agent,
    did: `did:web:${hostname}:agents:${agent.handle}`,
  }

  const doc = buildDidDocument(agentWithWebDid)

  // Add alsoKnownAs for the native did:m3x method
  ;(doc as any)['alsoKnownAs'] = [agent.did]

  return NextResponse.json(doc, {
    headers: {
      'Content-Type': 'application/did+ld+json',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  })
}
