// Run once in Supabase SQL editor:
//   create table registration_attempts (
//     id uuid primary key default gen_random_uuid(),
//     ip text not null,
//     created_at timestamptz not null default now()
//   );
//   create index on registration_attempts (ip, created_at);
//   alter table registration_attempts enable row level security;
//   -- Rows older than 24h can be pruned by the expire cron.

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { generateToken, hashToken } from '@/lib/auth'
import { encryptKey, isByokConfigured } from '@/lib/crypto'
import { isSafeWebhookUrl } from '@/lib/ssrf'

const VALID_PROVIDERS = ['gemini', 'anthropic']

// Hard caps on user-supplied profile fields.
const MAX_HANDLE_LEN = 64
const MAX_DISPLAY_NAME_LEN = 100
const MAX_TAGS = 20
const MAX_TAG_LEN = 64

function isValidStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.length <= MAX_TAGS &&
    v.every((s) => typeof s === 'string' && s.length > 0 && s.length <= MAX_TAG_LEN)
}

const RATE_LIMIT = 5 // max registrations per IP per hour
const WINDOW_MS = 60 * 60 * 1000

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const supabase = getServiceClient()

  // Durable per-IP rate limit. In-memory Maps reset on every Vercel cold
  // start, so a script can bypass them by hammering enough concurrent
  // invocations to spawn fresh lambdas. Supabase gives us one shared state.
  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString()
  const { count: recentCount } = await supabase
    .from('registration_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('ip', ip)
    .gte('created_at', windowStart)

  if ((recentCount ?? 0) >= RATE_LIMIT) {
    return NextResponse.json(
      { error: { message: 'Too many registrations from this IP. Try again later.', code: 'RATE_LIMITED' } },
      { status: 429 }
    )
  }

  // Log this attempt before doing the expensive work — it's fine if
  // registration later fails for other reasons; the limit is on attempts.
  await supabase
    .from('registration_attempts')
    .insert({ ip, created_at: new Date().toISOString() })

  try {
    const body = await req.json()
    const { handle, display_name, markets = [], capabilities = [], webhook_url, a2a_endpoint, public_key_multibase, api_key, api_key_provider } = body

    if (!handle) {
      return NextResponse.json(
        { error: { message: 'handle is required', code: 'MISSING_HANDLE' } },
        { status: 400 }
      )
    }

    if (typeof handle !== 'string' || handle.length > MAX_HANDLE_LEN || !/^[a-z0-9._-]{1,64}$/.test(handle)) {
      return NextResponse.json(
        { error: { message: `handle must be 1-${MAX_HANDLE_LEN} lowercase alphanumeric chars (dots, hyphens, underscores allowed)`, code: 'INVALID_HANDLE' } },
        { status: 400 }
      )
    }

    if (display_name !== undefined && (typeof display_name !== 'string' || display_name.length > MAX_DISPLAY_NAME_LEN)) {
      return NextResponse.json(
        { error: { message: `display_name must be a string of ${MAX_DISPLAY_NAME_LEN} chars or fewer`, code: 'INVALID_DISPLAY_NAME' } },
        { status: 400 }
      )
    }

    if (markets !== undefined && !isValidStringArray(markets)) {
      return NextResponse.json(
        { error: { message: `markets must be an array of up to ${MAX_TAGS} strings of ${MAX_TAG_LEN} chars each`, code: 'INVALID_MARKETS' } },
        { status: 400 }
      )
    }

    if (capabilities !== undefined && !isValidStringArray(capabilities)) {
      return NextResponse.json(
        { error: { message: `capabilities must be an array of up to ${MAX_TAGS} strings of ${MAX_TAG_LEN} chars each`, code: 'INVALID_CAPABILITIES' } },
        { status: 400 }
      )
    }

    if (webhook_url) {
      const safe = await isSafeWebhookUrl(webhook_url)
      if (!safe) {
        return NextResponse.json(
          { error: { message: 'webhook_url must be a public https:// URL', code: 'INVALID_WEBHOOK_URL' } },
          { status: 400 }
        )
      }
    }

    const { data: existing } = await supabase
      .from('agents')
      .select('id')
      .eq('handle', handle)
      .single()

    if (existing) {
      return NextResponse.json(
        { error: { message: 'handle already taken', code: 'HANDLE_TAKEN' } },
        { status: 409 }
      )
    }

    // BYOK handling
    let byokKeyEnc: string | null = null
    let byokProvider: string | null = null
    if (api_key && api_key_provider) {
      if (!VALID_PROVIDERS.includes(api_key_provider)) {
        return NextResponse.json(
          { error: { message: `api_key_provider must be one of: ${VALID_PROVIDERS.join(', ')}`, code: 'INVALID_PROVIDER' } },
          { status: 400 }
        )
      }
      if (!isByokConfigured()) {
        return NextResponse.json(
          { error: { message: 'BYOK is not enabled on this server', code: 'BYOK_NOT_CONFIGURED' } },
          { status: 400 }
        )
      }
      byokKeyEnc = encryptKey(api_key)
      byokProvider = api_key_provider
    }

    const rawToken = generateToken()
    const tokenHash = hashToken(rawToken)
    const did = `did:m3x:${handle}`

    const { data: agent, error: insertError } = await supabase
      .from('agents')
      .insert({
        handle,
        did,
        display_name: display_name ?? handle,
        markets,
        capabilities,
        webhook_url: webhook_url ?? null,
        token_hash: tokenHash,
        byok_key_enc: byokKeyEnc,
        byok_provider: byokProvider,
        created_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
      })
      .select('id, handle, did, display_name, markets, capabilities, trust_score')
      .single()

    if (insertError || !agent) {
      return NextResponse.json(
        { error: { message: 'Failed to create agent', code: 'DB_ERROR' } },
        { status: 500 }
      )
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://m3x.space'

    return NextResponse.json({
      agent: {
        id: agent.id,
        handle: agent.handle,
        did: agent.did,
        display_name: agent.display_name,
        markets: agent.markets,
        capabilities: agent.capabilities,
        trust_score: agent.trust_score,
      },
      token: rawToken,
      mcp_url: `${appUrl}/api/mcp`,
    }, { status: 201 })
  } catch (err) {
    console.error('[register] error', err)
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    )
  }
}
