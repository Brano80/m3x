// POST /api/library/claim/verify — check the domain-control proof and, on success,
// mark the card claimed (status='claimed', trust.domain_controlled=true).
// Checks DNS TXT first, then the /.well-known file. Both must contain the exact token.

import { NextRequest, NextResponse } from 'next/server'
import { resolveTxt } from 'node:dns/promises'
import { getServiceClient } from '@/lib/supabase'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// hostnames that must never be probed (defence-in-depth; card domains are real, but be safe)
const BLOCKED_HOST = /(^|\.)(localhost|internal|local|test|invalid|example)$|^\d{1,3}(\.\d{1,3}){3}$/i

async function fetchWithTimeout(url: string, ms = 8000): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      redirect: 'error',
      headers: { 'User-Agent': 'm3x-claim-verify/1.0 (+https://m3x.space)' },
    })
  } finally { clearTimeout(t) }
}

export async function POST(req: NextRequest) {
  let body: { challenge_id?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: { message: 'Invalid JSON', code: 'BAD_REQUEST' } }, { status: 400 })
  }
  const id = (body.challenge_id ?? '').trim()
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: { message: 'Invalid challenge id', code: 'INVALID_ID' } }, { status: 400 })
  }

  const supabase = getServiceClient()
  const { data: ch, error: chErr } = await supabase.rpc('library_claim_get', { p_id: id })
  if (chErr || !ch) {
    return NextResponse.json({ error: { message: 'Challenge not found', code: 'NOT_FOUND' } }, { status: 404 })
  }
  const challenge = ch as { urn: string; domain: string; token: string; status: string; expired: boolean }
  if (challenge.status === 'verified') {
    return NextResponse.json({ verified: true, urn: challenge.urn, alreadyDone: true })
  }
  if (challenge.status !== 'pending' || challenge.expired) {
    return NextResponse.json({ error: { message: 'Challenge expired — start a new one', code: 'EXPIRED' } }, { status: 410 })
  }

  const domain = challenge.domain.toLowerCase()
  const token = challenge.token
  if (BLOCKED_HOST.test(domain)) {
    return NextResponse.json({ error: { message: 'Domain not eligible for verification', code: 'BAD_DOMAIN' } }, { status: 400 })
  }

  let method: 'dns' | 'file' | null = null

  // 1) DNS TXT
  try {
    const records = await resolveTxt(domain)
    const flat = records.map(r => r.join('')).join(' ')
    if (flat.includes(token)) method = 'dns'
  } catch { /* no TXT / lookup failed — fall through to file */ }

  // 2) /.well-known file
  if (!method) {
    try {
      const res = await fetchWithTimeout(`https://${domain}/.well-known/m3x-verify.txt`)
      if (res.ok) {
        const text = (await res.text()).trim()
        if (text.includes(token)) method = 'file'
      }
    } catch { /* file missing / unreachable */ }
  }

  if (!method) {
    return NextResponse.json({
      verified: false,
      reason: 'Token not found via DNS TXT or /.well-known/m3x-verify.txt yet. DNS can take a few minutes to propagate.',
    })
  }

  const { data: done, error: doneErr } = await supabase.rpc('library_claim_complete', {
    p_id: id, p_method: method,
  })
  if (doneErr) {
    return NextResponse.json({ error: { message: 'Verification passed but update failed', code: 'COMPLETE_FAILED' } }, { status: 500 })
  }

  return NextResponse.json({ verified: true, method, urn: (done as { urn: string }).urn })
}
