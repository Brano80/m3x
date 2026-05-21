import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { isByokConfigured } from '@/lib/crypto'

// Admin-only infra diagnostic. Gated behind DEBUG_SECRET (Bearer token).
// If DEBUG_SECRET is unset, the endpoint is disabled entirely so misconfigured
// deploys cannot accidentally leak infra presence signals.

function checkSecret(req: NextRequest): boolean {
  const secret = process.env.DEBUG_SECRET?.trim()
  if (!secret) return false

  const auth = req.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return false

  try {
    const a = Buffer.from(secret, 'utf8')
    const b = Buffer.from(token, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export async function GET(req: NextRequest) {
  if (!checkSecret(req)) {
    return NextResponse.json(
      { error: { message: 'Forbidden', code: 'FORBIDDEN' } },
      { status: 403 }
    )
  }

  return NextResponse.json({
    env: {
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? null,
      SUPABASE_URL_SET: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_SET: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      ANTHROPIC_API_KEY_SET: !!process.env.ANTHROPIC_API_KEY,
      GEMINI_API_KEY_SET: !!process.env.GEMINI_API_KEY,
      HUGGINGFACE_API_KEY_SET: !!process.env.HUGGINGFACE_API_KEY,
      WEBHOOK_SECRET_SET: !!(process.env.WEBHOOK_SECRET || process.env.WEBHOOK_SIGNING_SECRET),
      BYOK_CONFIGURED: isByokConfigured(),
    },
    timestamp: new Date().toISOString(),
  })
}
