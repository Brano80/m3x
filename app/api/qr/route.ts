// GET /api/qr?data=<url-encoded-string>
// Generates a QR code PNG server-side — token never sent to third parties

import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'

// Lightweight per-IP throttle. QR generation is cheap, so an in-memory cap is
// fine; a DB-backed limit isn't worth the latency. Cold starts will reset the
// map but the per-warm-instance cap still throws the brake on rapid abuse.
const qrRateMap = new Map<string, { count: number; resetAt: number }>()
const QR_LIMIT = 20
const QR_WINDOW_MS = 60_000 // 20 requests per minute per IP

export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anon'
  const now = Date.now()
  const entry = qrRateMap.get(ip)
  if (entry && now < entry.resetAt) {
    if (entry.count >= QR_LIMIT) {
      return NextResponse.json(
        { error: { message: 'Rate limit exceeded', code: 'RATE_LIMITED' } },
        { status: 429 }
      )
    }
    entry.count++
  } else {
    qrRateMap.set(ip, { count: 1, resetAt: now + QR_WINDOW_MS })
  }

  const { searchParams } = new URL(req.url)
  const data = searchPar