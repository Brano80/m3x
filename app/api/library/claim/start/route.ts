// POST /api/library/claim/start — begin a domain-control claim for a library card.
// Returns a verification token + the DNS/file instructions. Public, lightly rate-limited.
// Security: the token is bound to the card's own domain (from the DB), not user input.

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

const URN_RE = /^urn:air:[a-z0-9.-]{1,128}:(business|agent|tool):[a-z0-9-]{1,128}$/
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// naive in-memory rate limit: 10 starts / IP / hour (resets on cold start)
const ipHits = new Map<string, { n: number; reset: number }>()
function rateLimited(ip: string): boolean {
  const now = Date.now()
  const e = ipHits.get(ip)
  if (!e || now > e.reset) { ipHits.set(ip, { n: 1, reset: now + 3600_000 }); return false }
  e.n += 1
  return e.n > 10
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: { message: 'Too many claim attempts, try later', code: 'RATE_LIMIT' } },
      { status: 429 }
    )
  }

  let body: { urn?: string; email?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: { message: 'Invalid JSON', code: 'BAD_REQUEST' } }, { status: 400 })
  }
  const urn = decodeURIComponent((body.urn ?? '').trim())
  const email = (body.email ?? '').trim()
  if (!URN_RE.test(urn)) {
    return NextResponse.json({ error: { message: 'Invalid URN', code: 'INVALID_URN' } }, { status: 400 })
  }
  if (email && !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: { message: 'Invalid email', code: 'INVALID_EMAIL' } }, { status: 400 })
  }

  const supabase = getServiceClient()
  const { data, error } = await supabase.rpc('library_claim_start', { p_urn: urn, p_email: email || null })
  if (error) {
    const code = /ALREADY_CLAIMED/.test(error.message) ? 'ALREADY_CLAIMED'
      : /CARD_NOT_FOUND/.test(error.message) ? 'CARD_NOT_FOUND' : 'CLAIM_START_FAILED'
    const status = code === 'CARD_NOT_FOUND' ? 404 : code === 'ALREADY_CLAIMED' ? 409 : 500
    const message = code === 'ALREADY_CLAIMED' ? 'This card is already claimed'
      : code === 'CARD_NOT_FOUND' ? 'No card for that URN' : 'Could not start claim'
    return NextResponse.json({ error: { message, code } }, { status })
  }

  const d = data as { challenge_id: string; domain: string; token: string }
  return NextResponse.json({
    challenge_id: d.challenge_id,
    domain: d.domain,
    token: d.token,
    methods: {
      dns: {
        type: 'TXT',
        host: d.domain,
        value: d.token,
        hint: `Add a TXT record on ${d.domain} with value: ${d.token}`,
      },
      file: {
        url: `https://${d.domain}/.well-known/m3x-verify.txt`,
        content: d.token,
        hint: `Upload a file at https://${d.domain}/.well-known/m3x-verify.txt containing: ${d.token}`,
      },
    },
  }, { status: 201 })
}
