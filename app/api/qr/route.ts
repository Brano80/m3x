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
  const ip =
    req.headers.get('x-real-ip')?.trim() ??
    req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ??
    'anon'
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
  const data = searchParams.get('data')

  if (!data) {
    return NextResponse.json(
      { error: { message: 'data param required', code: 'BAD_REQUEST' } },
      { status: 400 }
    )
  }

  const decoded = decodeURIComponent(data)

  // Basic length guard
  if (decoded.length > 2000) {
    return NextResponse.json(
      { error: { message: 'data too long', code: 'BAD_REQUEST' } },
      { status: 400 }
    )
  }

  const png = await QRCode.toBuffer(decoded, {
    type: 'png',
    width: 240,
    margin: 2,
    color: {
      dark: '#e8eaf0',  // matches M3X light text
      light: '#0a0a0f', // matches M3X dark background
    },
    errorCorrectionLevel: 'M',
  })

  return new NextResponse(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'private, no-store', // never cache — contains token
    },
  })
}
