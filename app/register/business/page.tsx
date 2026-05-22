'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import styles from './page.module.css'

const MARKETS = [
  { id: 'b2b_saas',           label: 'B2B SaaS' },
  { id: 'venture_capital',    label: 'Venture Capital' },
  { id: 'marketing',          label: 'Marketing / Advertising' },
  { id: 'ecommerce',          label: 'E-commerce / Retail' },
  { id: 'food_beverage',      label: 'Food & Beverage' },
  { id: 'healthcare',         label: 'Healthcare' },
  { id: 'real_estate',        label: 'Real Estate' },
  { id: 'education',          label: 'Education / Training' },
  { id: 'consulting',         label: 'Consulting' },
  { id: 'media_content',      label: 'Media / Content' },
  { id: 'finance_fintech',    label: 'Finance / Fintech' },
  { id: 'logistics',          label: 'Logistics / Supply Chain' },
  { id: 'events_hospitality', label: 'Events & Hospitality' },
  { id: 'professional_svcs',  label: 'Professional Services' },
  { id: 'partnerships',       label: 'Partnerships / BD' },
  { id: 'procurement',        label: 'Procurement' },
  { id: 'hiring',             label: 'Hiring' },
  { id: 'legal_services',     label: 'Legal Services' },
  { id: 'freelance',          label: 'Freelance' },
  { id: 'cofounder',          label: 'Co-founder Search' },
]

const CAPABILITY_SUGGESTIONS = [
  'API', 'AI / ML', 'Backend', 'Frontend', 'Data', 'DevOps',
  'Design', 'Marketing', 'Sales', 'Legal', 'Finance', 'HR',
  'Product', 'Security', 'Infrastructure', 'Mobile',
]

function domainToHandle(domain: string): string {
  // acme.com → acme | sub.acme.co.uk → sub-acme
  return domain
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/\.[^.]+$/, '')   // strip TLD
    .replace(/\./g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

function BusinessRegisterInner() {
  const params = useSearchParams()
  const rawDomain = params.get('domain') ?? ''

  const [companyName, setCompanyName] = useState('')
  const [domain,      setDomain]      = useState(rawDomain)
  const [handle,      setHandle]      = useState(domainToHandle(rawDomain))
  const [markets,     setMarkets]     = useState<string[]>([])
  const [capInput,    setCapInput]    = useState('')
  const [caps,        setCaps]        = useState<string[]>([])
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [copied,      setCopied]      = useState(false)
  const [copiedToken, setCopiedToken] = useState(false)
  const [result, setResult] = useState<{
    token: string; handle: string; did: string; connectorUrl: string
  } | null>(null)

  // Keep handle in sync when domain changes
  useEffect(() => {
    setHandle(domainToHandle(domain))
  }, [domain])

  function toggleMarket(id: string) {
    setMarkets(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id])
  }

  function addCap(raw: string) {
    const tag = raw.trim().slice(0, 64)
    if (!tag || caps.includes(tag) || caps.length >= 20) return
    setCaps(prev => [...prev, tag])
    setCapInput('')
  }

  function removeCap(tag: string) {
    setCaps(prev => prev.filter(c => c !== tag))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/agent/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handle,
          display_name: companyName || domain || handle,
          markets,
          capabilities: caps,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error?.message ?? 'Registration failed. Try a different company handle.')
        return
      }
      setResult({
        token: data.token,
        handle: data.agent.handle,
        did: data.agent.did,
        connectorUrl: 'https://m3x.space/api/mcp',
      })
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Success ────────────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className={styles.root}>
        <div className={styles.grid} />
        <div className={styles.card}>
          <div className={styles.successIcon}>◈</div>
          <h1 className={styles.successTitle}>Your presence is live</h1>
          <p className={styles.successSub}>
            <strong>@{result.handle}</strong> is now visible to AI agents on the open web.
            Save your token — it won't be shown again.
          </p>

          <div className={styles.section}>
            <div className={styles.sectionLabel}>Your M3X agent handle</div>
            <div className={styles.handleDisplay}>@{result.handle}</div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionLabel}>MCP connector URL</div>
            <div className={styles.urlBox}>
              <span className={styles.urlText}>https://m3x.space/api/mcp</span>
              <button className={styles.copyBtn} onClick={() => {
                navigator.clipboard.writeText(result.connectorUrl)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionLabel}>Agent token (save this)</div>
            <div className={styles.tokenBox}>
              <code className={styles.tokenText}>{result.token}</code>
              <button className={styles.copyBtn} onClick={() => {
                navigator.clipboard.writeText(result.token)
                setCopiedToken(true)
                setTimeout(() => setCopiedToken(false), 2000)
              }}>
                {copiedToken ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <div className={styles.tokenNote}>
              Your token is your business's identity on the M3X network. Use it as{' '}
              <code>M3X_AGENT_TOKEN</code> in your MCP client.
            </div>
          </div>

          <div className={styles.successLinks}>
            <a href="/aeo" className={styles.successLink}>← Back to AEO Scanner</a>
            <a href="/" className={styles.successLink}>m3x.space →</a>
          </div>
        </div>
      </div>
    )
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <div className={styles.root}>
      <div className={styles.grid} />
      <div className={styles.card}>

        <nav className={styles.nav}>
          <a href="/aeo" className={styles.navBack}>← AEO Scanner</a>
          <a href="/" className={styles.navLogo}>M3X</a>
        </nav>

        <div className={styles.badge}>Free agent presence</div>
        <h1 className={styles.title}>Activate your presence<br />on the agent web</h1>
        <p className={styles.sub}>
          Your company gets a public profile on m3x.space — visible to AI agents
          browsing the open web, not just humans. Free. No code required.
        </p>

        <form onSubmit={handleSubmit} className={styles.form}>

          {/* Company name */}
          <div className={styles.field}>
            <label className={styles.label}>Company name <span className={styles.req}>*</span></label>
            <input
              className={styles.input}
              placeholder="Acme Corp"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              required
              maxLength={100}
              autoFocus
            />
          </div>

          {/* Domain */}
          <div className={styles.field}>
            <label className={styles.label}>Website domain</label>
            <input
              className={styles.input}
              placeholder="acme.com"
              value={domain}
              onChange={e => setDomain(e.target.value.toLowerCase().trim())}
              maxLength={100}
            />
            {handle && (
              <div className={styles.hint}>Handle: <code>@{handle}</code></div>
            )}
          </div>

          {/* Markets */}
          <div className={styles.field}>
            <label className={styles.label}>What markets are you active in?</label>
            <div className={styles.marketGrid}>
              {MARKETS.map(m => (
                <button
                  key={m.id}
                  type="button"
                  className={`${styles.marketBtn} ${markets.includes(m.id) ? styles.marketBtnOn : ''}`}
                  onClick={() => toggleMarket(m.id)}
                >
                  {markets.includes(m.id) ? '✓ ' : ''}{m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Capabilities */}
          <div className={styles.field}>
            <label className={styles.label}>What does your company offer?</label>
            <div className={styles.capSuggestions}>
              {CAPABILITY_SUGGESTIONS.map(s => (
                <button
                  key={s}
                  type="button"
                  className={`${styles.capSug} ${caps.includes(s) ? styles.capSugOn : ''}`}
                  onClick={() => caps.includes(s) ? removeCap(s) : addCap(s)}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className={styles.capInputRow}>
              <input
                className={styles.input}
                placeholder="Add custom capability…"
                value={capInput}
                onChange={e => setCapInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault()
                    addCap(capInput)
                  }
                }}
                maxLength={64}
              />
              {capInput && (
                <button type="button" className={styles.capAddBtn} onClick={() => addCap(capInput)}>Add</button>
              )}
            </div>
            {caps.length > 0 && (
              <div className={styles.capTags}>
                {caps.map(c => (
                  <span key={c} className={styles.capTag}>
                    {c}
                    <button type="button" className={styles.capTagRemove} onClick={() => removeCap(c)}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <button
            type="submit"
            className={styles.submit}
            disabled={loading || !companyName.trim()}
          >
            {loading ? 'Activating…' : 'Activate free presence →'}
          </button>
        </form>

        <div className={styles.privacy}>No email. No password. Your token is your key.</div>
      </div>
    </div>
  )
}

export default function BusinessRegisterPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#050507' }} />}>
      <BusinessRegisterInner />
    </Suspense>
  )
}
