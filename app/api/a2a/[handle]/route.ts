// GET /api/a2a/:handle
// Returns an A2A-compatible agent card for any registered M3X agent.
// After a handshake is accepted, the counterpart can fetch this to discover
// the agent's A2A endpoint (if they have one), capabilities, and markets.
//
// Public endpoint — no auth required.

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://m3x.space'

export async function GET(
  _req: NextRequest,
  { params }: { params: { handle: string } }
) {
  const supabase = getServiceClient()
  const handle = params.handle.replace(/^@/, '')

  const { data: agent } = await supabase
    .from('agents')
    .select('handle, did, display_name, markets, capabilities, trust_score, a2a_endpoint, is_active, created_at')
    .or(`handle.eq.${handle},did.eq.did:m3x:${handle}`)
    .eq('is_active', true)
    .single()

  if (!agent) {
    return NextResponse.json(
      { error: { message: 'Agent not found or inactive', code: 'NOT_FOUND' } },
      { status: 404 }
    )
  }

  // If the agent has declared their own A2A endpoint, point to it.
  // Otherwise, M3X can proxy A2A tasks on their behalf via /api/a2a.
  const agentUrl = agent.a2a_endpoint ?? `${APP_URL}/api/a2a`

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
      pushNotifications: !!agent.a2a_endpoint,
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
