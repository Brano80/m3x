'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import SiteFooter from '@/app/components/SiteFooter'

interface CardLite { name?: string; domain?: string; status?: string }
interface Methods {
  dns: { type: string; host: string; value: string; hint: string }
  file: { url: string; content: string; hint: string }
}

const C = {
  bg: '#0a0e14', text: '#e6ecf5', dim: '#8fa1bb', faint: '#5c6f8a',
  border: '#1e2a3f', borderHi: '#2c3e5c', inset: '#0d1420', blue: '#4f92e8',
  green: '#34d399', amber: '#fbbf24',
}
const mono = 'var(--font-geist-mono, monospace)'

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) }}
      style={{ background: C.inset, border: `1px solid ${C.border}`, color: C.blue, borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}
    >{done ? '✓ Copied' : 'Copy'}</button>
  )
}

export default function ClaimPage() {
  const params = useParams()
  const rawUrn = params?.urn
  const urn = decodeURIComponent(Array.isArray(rawUrn) ? (rawUrn[0] ?? '') : (rawUrn ?? ''))

  const [card, setCard] = useState<CardLite | null>(null)
  const [email, setEmail] = useState('')
  const [domain, setDomain] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [methods, setMethods] = useState<Methods | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<'ok' | 'notyet' | null>(null)

  useEffect(() => {
    if (!urn) return
    fetch(`/api/library/card/${encodeURIComponent(urn)}`)
      .then(r => r.ok ? r.json() : null)
      .then(c => c && setCard({ name: c.name, domain: c.domain, status: c.status }))
      .catch(() => {})
  }, [urn])

  async function start() {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/library/claim/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urn, email }),
      })
      const j = await res.json()
      if (!res.ok) { setError(j?.error?.message ?? 'Could not start'); return }
      setDomain(j.domain); setChallengeId(j.challenge_id); setMethods(j.methods)
    } catch { setError('Network error') } finally { setBusy(false) }
  }

  async function verify() {
    setBusy(true); setError(''); setResult(null)
    try {
      const res = await fetch('/api/library/claim/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge_id: challengeId }),
      })
      const j = await res.json()
      if (!res.ok) { setError(j?.error?.message ?? 'Verification failed'); return }
      setResult(j.verified ? 'ok' : 'notyet')
    } catch { setError('Network error') } finally { setBusy(false) }
  }

  const alreadyClaimed = card?.status && card.status !== 'unclaimed'

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: C.bg, color: C.text }}>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 10, height: 60, padding: '0 40px', borderBottom: `1px solid rgba(255,255,255,0.06)`, background: 'rgba(5,5,7,0.88)', position: 'sticky', top: 0, zIndex: 100 }}>
        <a href="/" style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.08em', color: C.blue, textDecoration: 'none' }}>M3X</a>
        <span style={{ color: 'rgba(255,255,255,0.2)' }}>/</span>
        <a href="/library" style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>Library</a>
        <span style={{ color: 'rgba(255,255,255,0.2)' }}>/</span>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Claim</span>
      </nav>

      <div style={{ flex: 1, maxWidth: 720, width: '100%', margin: '0 auto', padding: '48px 24px 72px' }}>
        <a href={`/library/${encodeURIComponent(urn)}`} style={{ color: C.blue, fontSize: 13, textDecoration: 'none' }}>← back to card</a>

        <h1 style={{ fontSize: 26, fontWeight: 800, margin: '18px 0 6px' }}>
          Claim {card?.name ?? 'this card'}
        </h1>
        <p style={{ color: C.dim, fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          Prove you control <b style={{ color: C.text }}>{card?.domain ?? domain ?? 'the domain'}</b> to take
          control of this card. Claiming is free and only proves domain ownership — it never marks your
          claims &ldquo;confirmed&rdquo; and never affects ranking.
        </p>

        {alreadyClaimed ? (
          <div style={{ marginTop: 24, padding: 16, borderRadius: 10, border: `1px solid ${C.border}`, background: C.inset, color: C.amber }}>
            This card is already {card?.status}. If this is your business and you believe the claim is wrong,
            contact us to dispute it.
          </div>
        ) : !methods ? (
          <div style={{ marginTop: 28 }}>
            <label style={{ display: 'block', fontSize: 13, color: C.dim, marginBottom: 8 }}>
              Email (optional — for your records and the claim receipt)
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="you@yourdomain.com"
                style={{ flex: '1 1 240px', padding: '10px 14px', borderRadius: 8, border: `1px solid ${C.borderHi}`, background: C.inset, color: C.text, fontSize: 14 }} />
              <button onClick={start} disabled={busy}
                style={{ background: C.blue, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                {busy ? '…' : 'Start verification'}
              </button>
            </div>
            {error && <div style={{ marginTop: 12, color: '#f87171', fontSize: 13 }}>{error}</div>}
          </div>
        ) : (
          <div style={{ marginTop: 28 }}>
            <div style={{ fontSize: 13, color: C.dim, marginBottom: 14 }}>
              Add <b style={{ color: C.text }}>either</b> of these, then click Verify. DNS is strongest; the file is easiest.
            </div>

            {/* DNS method */}
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 12, background: C.inset }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Option A — DNS TXT record</div>
              <div style={{ fontFamily: mono, fontSize: 12, color: C.dim, lineHeight: 1.8 }}>
                <div>Host: <span style={{ color: C.text }}>{methods.dns.host}</span></div>
                <div>Type: <span style={{ color: C.text }}>TXT</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  Value: <span style={{ color: C.text, wordBreak: 'break-all' }}>{methods.dns.value}</span>
                  <Copy text={methods.dns.value} />
                </div>
              </div>
            </div>

            {/* File method */}
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 18, background: C.inset }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Option B — hosted file</div>
              <div style={{ fontFamily: mono, fontSize: 12, color: C.dim, lineHeight: 1.8 }}>
                <div style={{ wordBreak: 'break-all' }}>Upload to: <span style={{ color: C.text }}>{methods.file.url}</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  File contents: <span style={{ color: C.text, wordBreak: 'break-all' }}>{methods.file.content}</span>
                  <Copy text={methods.file.content} />
                </div>
              </div>
            </div>

            <button onClick={verify} disabled={busy}
              style={{ background: C.green, color: '#04120b', border: 'none', borderRadius: 8, padding: '11px 22px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
              {busy ? 'Checking…' : "I've added it — Verify"}
            </button>

            {result === 'ok' && (
              <div style={{ marginTop: 18, padding: 16, borderRadius: 10, border: `1px solid rgba(52,211,153,0.3)`, background: 'rgba(52,211,153,0.08)', color: C.green }}>
                ✓ Verified — you now control this card.{' '}
                <a href={`/library/${encodeURIComponent(urn)}`} style={{ color: C.green, fontWeight: 700 }}>View your card →</a>
              </div>
            )}
            {result === 'notyet' && (
              <div style={{ marginTop: 18, padding: 16, borderRadius: 10, border: `1px solid ${C.border}`, background: C.inset, color: C.amber }}>
                Not found yet. DNS can take a few minutes to propagate — add the record/file, wait, then Verify again.
              </div>
            )}
            {error && <div style={{ marginTop: 14, color: '#f87171', fontSize: 13 }}>{error}</div>}
          </div>
        )}
      </div>

      <SiteFooter />
    </div>
  )
}
