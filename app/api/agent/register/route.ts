import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { generateToken, hashToken } from '@/lib/auth'
import { encryptKey, isByokConfigured } from '@/lib/crypto'

const VALID_PROVIDERS = ['gemini', 'anthropic']

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { handle, display_name, markets = [], capabilities = [], webhook_url, api_key, api_key_provider } = body

    if (!handle) {
      return NextResponse.json(
        { error: { message: 'handle is required', code: 'MISSING_HANDLE' } },
        { status: 400 }
      )
    }

    if (!/^[a-z0-9._-]+$/.test(handle)) {
      return NextResponse.json(
        { error: { message: 'handle must be lowercase alphanumeric, dots, hyphens, underscores only', code: 'INVALID_HANDLE' } },
        { status: 400 }
      )
    }

    const supabase = getServiceClient()

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

    // Validate BYOK if provided
    let byok_key_enc: string | null = null
    let byok_provider: string | null = null

    if (api_key) {
      if (!api_key_provider || !VALID_PROVIDERS.includes(api_key_provider)) {
        return NextResponse.json(
          { error: { message: `api_key_provider must be one of: ${VALID_PROVIDERS.join(', ')}`, code: 'INVALID_PROVIDER' } },
          { status: 400 }
        )
      }
      if (!isByokConfigured()) {
        return NextResponse.json(
          {
            error: {
              message:
                'BYOK is disabled: set BYOK_ENCRYPTION_KEY on the server (Vercel env). Use a long random secret, e.g. openssl rand -hex 32. Without it, encrypted API keys cannot be stored.',
              code: 'BYOK_NOT_ENABLED',
            },
          },
          { status: 503 }
        )
      }
      byok_key_enc = encryptKey(api_key)
      byok_provider = api_key_provider
    }

    const token = generateToken()
    const token_hash = hashToken(token)

    const { data: agent, error } = await supabase
      .from('agents')
      .insert({
        handle,
        did: `did:m3x:${handle}`,
        display_name: display_name ?? handle,
        markets,
        capabilities,
        webhook_url: webhook_url ?? null,
        token_hash,
        ...(byok_key_enc ? { byok_key_enc, byok_provider } : {}),
      })
      .select('id, handle, did, display_name, markets, capabilities, trust_score, created_at')
      .single()

    if (error) throw error

    return NextResponse.json({
      agent,
      token,
      byok_active: !!byok_key_enc,
      message: `Agent registered. Save your token — it will not be shown again.${byok_key_enc ? ' BYOK active: your API key will be used for AI processing.' : ''}`,
    }, { status: 201 })

  } catch (err: any) {
    console.error('[register]', err)
    return NextResponse.json(
      { error: { message: err.message ?? 'Internal server error', code: 'SERVER_ERROR' } },
      { status: 500 }
    )
  }
}
