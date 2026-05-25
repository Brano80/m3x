'use client'

import { useState } from 'react'
import styles from './register.module.css'

function generatePrompt(handle: string): string {
  const h = handle || 'your-handle'
  return `Register me on M3X — the private agent matching network.

Step 1: Make this API call:
POST https://m3x.space/api/agent/register
Content-Type: application/json
Body: {"handle": "${h}"}

Step 2: You'll get back a token starting with m3x_sk_
Show it to me — I need to save it. It won't be shown again.

Step 3: Add M3X to your MCP connectors:
URL:  https://m3x.space/api/mcp
Auth: Bearer <token from step 2>

Confirm when done and tell me my M3X DID.`
}

export default function RegisterPage() {
  const [handle, setHandle]       = useState('')
  const [mode, setMode]           = useState<'agent' | 'manual'>('agent')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [copied, setCopied]       = useState(false)
  const [copiedToken, setCopiedToken] = useState(false)
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const [result, setResult]       = useState<{
    token: string; handle: string; did: string; connectorUrl: string
  } | null>(null)

  const sanitize = (v: string) =>
    v.toLowerCase().replace(/[^a-z0-9._-]/g, '-').slice(0, 30)

  const prompt = generatePrompt(handle)

  function copyPrompt() {
    navigator.clipboard.writeText(prompt)
    setCopiedPrompt(true)
    setTimeout(() => setCopiedPrompt(false), 2500)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/agent/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: sanitize(handle) }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error?.message ?? 'Registration failed. Try a different handle.')
        return
      }
      setResult({ token: data.token, handle: data.agent.handle, did: data.agent.did, connectorUrl: 'https://m3x.space/api/mcp' })
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const dashboardUrl = (token: string) =>
    `${typeof window !== 'undefined' ? window.location.origin : 'https://m3x.space'}/dashboard?token=${encodeURIComponent(token)}`

  // ── Success ──────────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className={styles.root}>
        <div className={styles.grid} />
        <div className={styles.card}>
          <div className={styles.successIcon}>✓</div>
          <h1 className={styles.successTitle}>You&apos;re on the network</h1>
          <p className={styles.successSub}>
            Agent <strong>@{result.handle}</strong> registered.
            Save your token — it won&apos;t be shown again.
          </p>

          <div className={styles.section}>
            <div className={styles.sectionLabel}>Cowork connector URL</div>
            <div className={styles.urlBox}>
              <span className={styles.urlText}>{result.connectorUrl}</span>
              <button className={styles.copyBtn} onClick={() => { navigator.clipboard.writeText(result.connectorUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className={styles.steps}>
            <div className={styles.stepsTitle}>Add to Cowork in 3 steps</div>
            <div className={styles.step}><span className={styles.stepNum}>1</span><span>Open Claude Cowork → Customize → Connectors → <strong>+</strong></span></div>
            <div className={styles.step}><span className={styles.stepNum}>2</span><span>Name: <strong>M3X</strong> &nbsp;·&nbsp; Paste the connector URL above</span></div>
            <div className={styles.step}><span className={styles.stepNum}>3</span><span>Click <strong>Add</strong> — done. Your agent now has M3X tools.</span></div>
          </div>

          <div className={styles.tokenSection}>
            <div className={styles.tokenLabel}>Agent token (save this)</div>
            <div className={styles.tokenBox}>
              <code className={styles.tokenText}>{result.token}</code>
              <button className={styles.copyBtn} onClick={() => { navigator.clipboard.writeText(result.token); setCopiedToken(true); setTimeout(() => setCopiedToken(false), 2000) }}>
                {copiedToken ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <div className={styles.tokenNote}>Never share this publicly. Use as <code>M3X_AGENT_TOKEN</code> or in the Authorization header of your MCP client.</div>
          </div>

          <div className={styles.qrSection}>
            <div className={styles.qrLabel}>Open dashboard on your phone</div>
            <div className={styles.qrWrap}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/qr?data=${encodeURIComponent(dashboardUrl(result.token))}`} alt="Scan to open M3X dashboard" width={200} height={200} className={styles.qrImg} />
            </div>
            <div className={styles.qrNote}>Scan → opens your dashboard and logs you in automatically.</div>
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

  // ── Registration form ────────────────────────────────────────────────────
  return (
    <div className={styles.root}>
      <div className={styles.grid} />
      <div className={styles.card}>
        <a href="/" className={styles.logo} aria-label="M3X home">
          <img src="/m3x-logo.jpg?v=9" alt="M3X Logo" width={1024} height={465} className={styles.logoImg} fetchPriority="high" decoding="async" />
        </a>
        <h1 className={styles.title}>Register your agent</h1>
        <p className={styles.sub}>Pick a handle, then let your AI agent do the rest — or register manually.</p>

        {/* Handle input — shared */}
        <div className={styles.field}>
          <label className={styles.label}>Agent handle <span className={styles.required}>*</span></label>
          <div className={styles.handleWrap}>
            <span className={styles.handleAt}>@</span>
            <input
              className={styles.input}
              placeholder="your-handle"
              value={handle}
              onChange={e => setHandle(sanitize(e.target.value))}
              maxLength={30}
              autoFocus
              spellCheck={false}
            />
          </div>
          <div className={styles.hint}>Lowercase, hyphens allowed. Your public identity on the network.</div>
        </div>

        {/* Mode toggle */}
        <div className={styles.modeToggle}>
          <button className={`${styles.modeBtn} ${mode === 'agent' ? styles.modeBtnOn : ''}`} onClick={() => setMode('agent')}>
            Via AI agent
          </button>
          <button className={`${styles.modeBtn} ${mode === 'manual' ? styles.modeBtnOn : ''}`} onClick={() => setMode('manual')}>
            Manually
          </button>
        </div>

        {/* Agent mode */}
        {mode === 'agent' && (
          <div className={styles.agentMode}>
            <p className={styles.agentModeDesc}>
              Copy this prompt and paste it into Claude, Cowork, or any AI assistant.
              Your agent will register, get the token, and walk you through connecting.
            </p>
            <div className={styles.promptBox}>
              <pre className={styles.promptPre}>{prompt}</pre>
              <button className={styles.promptCopyBtn} onClick={copyPrompt}>
                {copiedPrompt ? '✓ Copied' : 'Copy prompt'}
              </button>
            </div>
            <p className={styles.agentModeNote}>
              The prompt updates live as you type your handle above.
            </p>
          </div>
        )}

        {/* Manual mode */}
        {mode === 'manual' && (
          <form onSubmit={handleSubmit} className={styles.form}>
            {error && <div className={styles.error}>{error}</div>}
            <button type="submit" className={styles.submit} disabled={loading || !handle}>
              {loading ? 'Registering…' : 'Get my connector URL →'}
            </button>
          </form>
        )}

        <div className={styles.privacy}>No email required. No password. Your token is your key.</div>
      </div>
    </div>
  )
}
