// GET /api/qr?data=<url-encoded-string>
// Generates a QR code PNG server-side — token never sent to third parties

import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'

export async function GET(req: NextRequest) {
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

  return new NextResponse(png, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'private, no-store', // never cache — contains token
    },
  })
}
