import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const score  = parseInt(searchParams.get('score')  ?? '0', 10)
  const max    = parseInt(searchParams.get('max')    ?? '0', 10)
  const domain = searchParams.get('domain') ?? ''

  const showScore = score > 0 && max > 0
  const pct = showScore ? Math.round((score / max) * 100) : 0
  const colour = pct >= 70 ? '#00ff88' : pct >= 40 ? '#f59e0b' : '#ef4444'
  const label  = pct >= 70 ? 'Agent-Ready' : pct >= 40 ? 'Partial' : 'Not Ready'

  // Width scales with content
  const scoreText  = showScore ? `${score}/${max}` : ''
  const rightWidth = showScore ? 90 : 72
  const totalWidth = 48 + rightWidth

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="M3X Agent-Ready Badge">
  <title>M3X: ${showScore ? `${label} ${score}/${max}` : 'Agent-Ready'}</title>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1a1a2e"/>
      <stop offset="1" stop-color="#0e0e14"/>
    </linearGradient>
  </defs>
  <!-- Left pill: M3X brand -->
  <rect width="48" height="20" rx="4" fill="url(#bg)"/>
  <rect width="48" height="20" rx="4" fill="none" stroke="#4f92e8" stroke-width="0.8" stroke-opacity="0.6"/>
  <text x="6" y="13.5" font-family="'Geist Mono',monospace,sans-serif" font-size="9" font-weight="700" fill="#4f92e8" letter-spacing="0.04em">◈ M3X</text>

  <!-- Right pill: status -->
  <rect x="50" width="${rightWidth}" height="20" rx="4" fill="url(#bg)"/>
  <rect x="50" width="${rightWidth}" height="20" rx="4" fill="none" stroke="${colour}" stroke-width="0.8" stroke-opacity="0.5"/>
  <text x="${50 + (showScore ? 6 : rightWidth / 2)}" y="13.5" font-family="'Geist Mono',monospace,sans-serif" font-size="9" font-weight="600" fill="${colour}" ${showScore ? '' : 'text-anchor="middle"'}>${label}${showScore ? ` ${scoreText}` : ''}</text>
</svg>`

  return new NextResponse(svg, {
    headers: {
      'Content-Type':  'image/svg+xml',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
