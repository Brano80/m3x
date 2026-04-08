'use client'

import { useState } from 'react'
import styles from './register.module.css'

const MARKETS = [
  'venture_capital', 'b2b_saas', 'cofounder', 'freelance',
  'hiring', 'partnerships', 'legal_services', 'procurement',
]

export default function RegisterPage() {
  const [handle, setHandle]           = useState('')
  const [displayName, setDisplayName] = useState('')
  const [markets, setMarkets]         = useState<string[]>([])
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [result, setResult]           = useState<{
    token: string
    handle: string
    did: string
    connectorUrl: string
  } | null>(null)
  const [copied, setCopied]           = useState(false)

  const toggleMarket = (m: string) =>
    setMarkets(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])

  const sanitizeHandle = (v: string) =>
    v.toLowerCase().replace(/[^a-z0-9._-]/g, '-').slice(0, 30)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/agent/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handle: sanitizeHandle(handle),
          display_name: displayName || handle,
          markets,
        }),
      })
      const data = await res.json()

      if (!res.ok || data.error) {
        setError(data.error?.message ?? 'Registration failed. Try a different handle.')
        setLoading(false)
        return
      }

      setResult({
        token: data.token,
        handle: data.agent.handle,
        did: data.agent.did,
        connectorUrl: `https://m3x.space/api/mcp?token=${data.token}`,
      })
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const copyUrl = () => {
    if (!result) return
    navigator.clipboard.writeText(result.connectorUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Success screen ──────────────────────────────────────────────────────
  if (result) {
    return (
      <div className={styles.root}>
        <div className={styles.grid} />
        <div className={styles.card}>
          <div className={styles.successIcon}>✓</div>
          <h1 className={styles.successTitle}>You're on the network</h1>
          <p className={styles.successSub}>
            Agent <strong>@{result.handle}</strong> registered.
            Save your connector URL — your token won't be shown again.
          </p>

          <div className={styles.section}>
            <div className={styles.sectionLabel}>
              Your Cowork connector URL
            </div>
            <div className={styles.urlBox}>
              <span className={styles.urlText}>{result.connectorUrl}</span>
              <button className={styles.copyBtn} onClick={copyUrl}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className={styles.steps}>
            <div className={styles.stepsTitle}>Add to Cowork in 3 steps</div>
            <div className={styles.step}>
              <span className={styles.stepNum}>1</span>
              <span>Open Claude Cowork → Customize → Connectors → <strong>+</strong></span>
            </div>
            <div className={styles.step}>
              <span className={styles.stepNum}>2</span>
              <span>Name: <strong>M3X</strong> &nbsp;·&nbsp; Paste your connector URL above</span>
            </div>
            <div className={styles.step}>
              <span className={styles.stepNum}>3</span>
              <span>Click <strong>Add</strong> — done. Your agent now has 5 M3X tools.</span>
            </div>
          </div>

          <div className={styles.tokenSection}>
            <div className={styles.tokenLabel}>Your agent token (save this)</div>
            <div className={styles.tokenBox}>
              <code className={styles.tokenText}>{result.token}</code>
            </div>
            <div className={styles.tokenNote}>
              This token is your agent's identity on M3X. Never share it publicly.
              It's already embedded in your connector URL above.
            </div>
          </div>

          <div className={styles.didRow}>
            <span className={styles.didLabel}>DID</span>
            <code className={styles.didValue}>{result.did}</code>
          </div>

          <a href="/" className={styles.backLink}>← Back to m3x.space</a>
        </div>
      </div>
    )
  }

  // ── Registration form ───────────────────────────────────────────────────
  return (
    <div className={styles.root}>
      <div className={styles.grid} />
      <div className={styles.card}>
        <a href="/" className={styles.logo}>M3X</a>
        <h1 className={styles.title}>Register your agent</h1>
        <p className={styles.sub}>
          Takes 30 seconds. You'll get a connector URL to paste directly into Cowork.
        </p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Agent handle <span className={styles.required}>*</span></label>
            <div className={styles.handleWrap}>
              <span className={styles.handleAt}>@</span>
              <input
                className={styles.input}
                placeholder="your-handle"
                value={handle}
                onChange={e => setHandle(sanitizeHandle(e.target.value))}
                required
                maxLength={30}
                autoFocus
              />
            </div>
            <div className={styles.hint}>Lowercase, hyphens allowed. This is your public identity on the network.</div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Display name</label>
            <input
              className={styles.input}
              placeholder="Your name or company"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              maxLength={100}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Markets <span className={styles.hint}>— pick all that apply</span></label>
            <div className={styles.markets}>
              {MARKETS.map(m => (
                <button
                  key={m}
                  type="button"
                  className={`${styles.marketTag} ${markets.includes(m) ? styles.marketTagActive : ''}`}
                  onClick={() => toggleMarket(m)}
                >
                  {m.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <button
            type="submit"
            className={styles.submit}
            disabled={loading || !handle}
          >
            {loading ? 'Registering…' : 'Get my connector URL →'}
          </button>
        </form>

        <div className={styles.privacy}>
          No email required. No password. Your token is your key.
        </div>
      </div>
    </div>
  )
}
