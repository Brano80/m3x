// POST /api/aeo/test-request — agent-test funnel intake (test+fix, Step 0)
// Public, rate-limited lightly by shape validation; writes via service_role-only RPC.

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

const DOMAIN_RE = /^[a-z0-9.-]{3,253}$/
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export async function POST(req: NextRequest) {
  let body: { domain?: string; email?: string; task?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: { message: 'Invalid JSON', code: 'BAD_REQUEST' } }, { status: 400 })
  }

  const domain = (body.domain ?? '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  const email = (body.email ?? '').toLowerCase().trim()
  const task = (body.task ?? '').trim().slice(0, 500)

  if (!DOMAIN_RE.test(domain) || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: { message: 'Valid domain and email required', code: 'INVALID_INPUT' } },
      { status: 400 }
    )
  }

  try {
    const supabase = getServiceClient()
    await supabase.rpc('library_log_test_request', { p_domain: domain, p_email: email, p_task: task || null })
  } catch {
    return NextResponse.json(
      { error: { message: 'Could not save request', code: 'SAVE_FAILED' } },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
