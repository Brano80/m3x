import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { isByokConfigured } from '@/lib/crypto'

// Admin-only infra diagnostic. Gated behind DEBUG_SECRET (Bearer token).
// If DEBUG_SECRET is unset, the endpoint is disabled entirely so misconfigured
// deploys cannot accidentally leak infra presence signals.

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export async function GET(req: NextRequest) {
  const expected = process.env.DEBUG_SECRET?.trim()
  if (!expected) {
    return NextResponse.json(
      { error: { message: 'Not found', code: 'NOT_FOUND' } },
      { status: 404 }
    )
  }

  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''

  if (!token || !safeEqual(token, expected)) {
    return NextResponse.json(
      { error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } },
      { status: 401 }
    )
  }

  return NextResponse.json({
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    huggingface: !!process.env.HUGGINGFACE_API_KEY,
    supabase_service: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    byok_encryption: isByokConfigured(),
  })
}
