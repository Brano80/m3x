import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { generateToken, hashToken } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { handle, display_name, markets = [], capabilities = [], webhook_url } = body

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
      })
      .select('id, handle, did, display_name, markets, capabilities, trust_score, created_at')
      .single()

    if (error) throw error

    return NextResponse.json({
      agent,
      token,
      message: 'Agent registered. Save your token — it will not be shown again.',
    }, { status: 201 })

  } catch (err: any) {
    console.error('[register]', err)
    return NextResponse.json(
      { error: { message: err.message ?? 'Internal server error', code: 'SERVER_ERROR' } },
      { status: 500 }
    )
  }
}
