// GET /api/a2a/:handle
// Returns an A2A-compatible agent card for any registered M3X agent.
// Public endpoint — no auth required, so it NEVER exposes private fields
// (webhook_url, a2a_endpoint). The card always routes tasks through the M3X
// A2A proxy at /api/a2a; the agent's private endpoint is only disclosed to
// the counterpart after mutual handshake acceptance.

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://m3x.space'
const HANDLE_RE = /^[a-z0-9._-]{1,64}$/

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const supabase = getServiceClient()
  const { handle: raw } = await params
  const handle = decodeURIComponent(raw).replace(/^@/, '').toLowerCase()

  // Validate before querying — never interpolate user input into PostgREST filters.
  if (!HANDLE_RE.test(handle)) {
    return NextResponse.json(
      { error: { message: 'Invalid handle', code: 'INVALID_HANDLE' } },
      { status: 400 }
    )
  }

  const { data: agent } = await supabase
    .from('agents')
    .select('handle, did, display_name, markets, capabilities, trust_score, is_active, created_at')
    .eq('handle', handle)
    .eq('is_active', true)
    .single()

  if (!agent) {
    return NextResponse.json(
      { error: { message: 'Agent not found or inactive', code: 'NOT_FOUND' } },
      { status: 404 }
    )
  }

  // Public card always points to the M3X A2A proxy — the agent's own a2a_endpoint
  // is private and only revealed after mutual handshake acceptance.
  const agentUrl = `${APP_URL}/api/a2a`

  const card = {
    name: agent.display_name ?? `@${agent.handle}`,
    description: `M3X agent — markets: ${(agent.markets ?? []).join(', ') || 'general'}`,
    url: agentUrl,
    provider: {
      organization: agent.display_name ?? agent.handle,
      url: agentUrl,
    },
    version: '1.0.0',
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    authentication: {
      schemes: ['Bearer'],
    },
    defaultInputModes: ['application/json'],
    defaultOutputModes: ['application/json'],
    // Agent Card extensions — M3X-specific fields
    extensions: {
      'm3x:did': agent.did,
      'm3x:handle': `@${agent.handle}`,
      'm3x:trust_score': agent.trust_score,
      'm3x:markets': agent.markets ?? [],
      'm3x:capabilities': agent.capabilities ?? [],
      'm3x:registered_at': agent.created_at,
    },
  }

  return NextResponse.json(card, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  })
}
