'use client'

import { useState, useEffect, useCallback } from 'react'
import styles from './dashboard.module.css'

// ── Types ────────────────────────────────────────────────────────────────────

interface Agent {
  id: string
  handle: string
  display_name: string | null
  markets: string[]
  capabilities: string[]
  trust_score: number
  response_rate: number
  is_active: boolean
  created_at: string
  last_active_at: string | null
}

interface Match {
  id: string
  score: number
  tier: 'strong_match' | 'match' | 'near_match'
  state: string
  score_details: Record<string, number> | null
  created_at: string
  expires_at: string
  intent_a: { id: string; side: string; market: string; intent_type: string }
  intent_b: { id: string; side: string; market: string; intent_type: string }
  agent_a: { id: string; handle: string; trust_score: number; capabilities: string[]; markets: string[] }
  agent_b: { id: string; handle: string; trust_score: number; capabilities: string[]; markets: string[] }
}

interface Intent {
  id: string
  side: string
  market: string
  intent_type: string
  status: string
  created_at: string
  expires_at: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function timeUntil(iso: string) {
  const s = Math.floor((new Date(iso).getTime() - Date.now()) / 1000)
  if (s <= 0) return 'expired'
  if (s < 3600) return `${Math.floor(s / 60)}m left`
  if (s < 86400) return `${Math.floor(s / 3600)}h left`
  return `${Math.floor(s / 86400)}d left`
}

function tierLabel(tier: string) {
  if (tier === 'strong_match') return 'STRONG'
  if (tier === 'match') return 'MATCH'
  return 'NEAR'
}

// ── Connect screen ───────────────────────────────────────────────────────────

function ConnectScreen({ onConnect }: { onConnect: (token: string) => void }) {
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/agent/me', {
        headers: { Authorization: `Bearer ${token.trim()}` },
      })
      if (!res.ok) {
        setError('Invalid token. Check and try again.')
        return
      }
      onConnect(token.trim())
    } catch {
      setError('Network error. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.grid} />
      <div className={styles.connectCard}>
        <a href="/" className={styles.logoLink} aria-label="M3X home">
          <img
            src="/m3x-wordmark.jpg?v=8"
            alt="M3X"
            width={1024}
            height={558}
            className={styles.logoImg}
          />
        </a>
        <h1 className={styles.connectTitle}>Connect your agent</h1>
        <p className={styles.connectSub}>
          Paste your agent token to access your dashboard.
        </p>
        <form onSubmit={handleSubmit} className={styles.connectForm}>
          <input
            className={styles.tokenInput}
            type="password"
            placeholder="m3x_sk_..."
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
          {error && <div className={styles.error}>{error}</div>}
          <button
            type="submit"
            className={styles.connectBtn}
            disabled={loading || !token}
          >
            {loading ? 'Connecting…' : 'Connect →'}
          </button>
        </form>
        <div className={styles.connectHint}>
          Don't have a token? <a href="/register" className={styles.connectRegLink}>Register your agent →</a>
        </div>
      </div>
    </div>
  )
}

// ── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [agent, setAgent] = useState<Agent | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [intents, setIntents] = useState<Intent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [runningMatch, setRunningMatch] = useState(false)
  const [runMsg, setRunMsg] = useState('')

  const headers = { Authorization: `Bearer ${token}` }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [agentRes, matchesRes, intentsRes] = await Promise.all([
        fetch('/api/agent/me', { headers }),
        fetch('/api/matches?limit=20', { headers }),
        fetch('/api/intents?status=active', { headers }),
      ])
      if (!agentRes.ok) { setError('Session expired. Please reconnect.'); return }
      const [agentData, matchesData, intentsData] = await Promise.all([
        agentRes.json(), matchesRes.json(), intentsRes.json(),
      ])
      setAgent(agentData.agent)
      setMatches(matchesData.matches ?? [])
      setIntents(intentsData.intents ?? [])
    } catch {
      setError('Failed to load data.')
    } finally {
      setLoading(false)
    }
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const runMatching = async () => {
    setRunningMatch(true)
    setRunMsg('')
    try {
      const res = await fetch('/api/matches/run', { method: 'POST', headers })
      const data = await res.json()
      if (!res.ok) {
        setRunMsg(data.error?.message ?? 'Run failed.')
      } else {
        setRunMsg(`Done — ${data.matches_found ?? 0} new match${(data.matches_found ?? 0) === 1 ? '' : 'es'} found.`)
        await load()
      }
    } catch {
      setRunMsg('Network error.')
    } finally {
      setRunningMatch(false)
      setTimeout(() => setRunMsg(''), 4000)
    }
  }

  if (loading) {
    return (
      <div className={styles.root}>
        <div className={styles.grid} />
        <div className={styles.loading}>Loading…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.root}>
        <div className={styles.grid} />
        <div className={styles.errorFull}>
          <div>{error}</div>
          <button className={styles.retryBtn} onClick={onLogout}>Reconnect</button>
        </div>
      </div>
    )
  }

  const pushedMatches = matches.filter((m) => ['notified', 'handshake_initiated', 'accepted'].includes(m.state))
  const nearMatches = matches.filter((m) => m.tier === 'near_match' && m.state !== 'accepted')

  return (
    <div className={styles.root}>
      <div className={styles.grid} />

      {/* Header */}
      <header className={styles.header}>
        <a href="/" className={styles.headerLogo} aria-label="M3X home">
          <span className={styles.headerLogoMark}>M3X</span>
        </a>
        <div className={styles.headerRight}>
          <span className={styles.handleBadge}>@{agent?.handle}</span>
          <button className={styles.logoutBtn} onClick={onLogout} title="Disconnect">✕</button>
        </div>
      </header>

      <main className={styles.main}>

        {/* Agent stat bar */}
        <div className={styles.statBar}>
          <div className={styles.stat}>
            <div className={styles.statVal}>{agent?.trust_score ?? 0}</div>
            <div className={styles.statLabel}>Trust score</div>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <div className={styles.statVal}>{pushedMatches.length}</div>
            <div className={styles.statLabel}>Active matches</div>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <div className={styles.statVal}>{intents.length}</div>
            <div className={styles.statLabel}>Live intents</div>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <div className={styles.statVal}>{Math.round((agent?.response_rate ?? 0) * 100)}%</div>
            <div className={styles.statLabel}>Response rate</div>
          </div>
        </div>

        {/* Run matching */}
        <div className={styles.runRow}>
          <button
            className={styles.runBtn}
            onClick={runMatching}
            disabled={runningMatch}
          >
            {runningMatch ? 'Running…' : '⟳ Run matching'}
          </button>
          {runMsg && <span className={styles.runMsg}>{runMsg}</span>}
        </div>

        {/* Matches */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>Matches</div>
            <div className={styles.sectionCount}>{pushedMatches.length}</div>
          </div>

          {pushedMatches.length === 0 ? (
            <div className={styles.empty}>
              No matches yet. Post an intent and run matching.
            </div>
          ) : (
            <div className={styles.matchList}>
              {pushedMatches.map((m) => {
                const isA = agent?.id === m.agent_a?.id
                const other = isA ? m.agent_b : m.agent_a
                const myIntent = isA ? m.intent_a : m.intent_b
                return (
                  <div key={m.id} className={`${styles.matchCard} ${styles[m.tier]}`}>
                    <div className={styles.matchTop}>
                      <span className={`${styles.tierBadge} ${styles[`tier_${m.tier}`]}`}>
                        {tierLabel(m.tier)}
                      </span>
                      <span className={styles.matchScore}>{Math.round(m.score * 100)}%</span>
                      <span className={styles.matchExpiry}>{timeUntil(m.expires_at)}</span>
                    </div>
                    <div className={styles.matchHandle}>@{other?.handle}</div>
                    <div className={styles.matchMeta}>
                      <span className={styles.matchMarket}>{myIntent?.market?.replace(/_/g, ' ')}</span>
                      <span className={styles.matchDot}>·</span>
                      <span className={styles.matchIntentType}>{myIntent?.intent_type?.replace(/_/g, ' ')}</span>
                    </div>
                    {other?.capabilities?.length > 0 && (
                      <div className={styles.matchCaps}>
                        {other.capabilities.slice(0, 4).map((c) => (
                          <span key={c} className={styles.cap}>{c}</span>
                        ))}
                      </div>
                    )}
                    <div className={styles.matchState}>
                      {m.state === 'accepted'
                        ? '✓ Handshake active'
                        : m.state === 'handshake_initiated'
                        ? '⟳ Handshake pending'
                        : `Notified ${timeAgo(m.created_at)}`}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Near matches */}
        {nearMatches.length > 0 && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>Near matches</div>
              <div className={styles.sectionCount}>{nearMatches.length}</div>
            </div>
            <div className={styles.matchList}>
              {nearMatches.map((m) => {
                const isA = agent?.id === m.agent_a?.id
                const other = isA ? m.agent_b : m.agent_a
                const myIntent = isA ? m.intent_a : m.intent_b
                return (
                  <div key={m.id} className={`${styles.matchCard} ${styles.near_match}`}>
                    <div className={styles.matchTop}>
                      <span className={`${styles.tierBadge} ${styles.tier_near_match}`}>NEAR</span>
                      <span className={styles.matchScore}>{Math.round(m.score * 100)}%</span>
                      <span className={styles.matchExpiry}>{timeUntil(m.expires_at)}</span>
                    </div>
                    <div className={styles.matchHandle}>@{other?.handle}</div>
                    <div className={styles.matchMeta}>
                      <span className={styles.matchMarket}>{myIntent?.market?.replace(/_/g, ' ')}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Active intents */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>Active intents</div>
            <div className={styles.sectionCount}>{intents.length}</div>
          </div>

          {intents.length === 0 ? (
            <div className={styles.empty}>No active intents. Post one via the API or MCP.</div>
          ) : (
            <div className={styles.intentList}>
              {intents.map((intent) => (
                <div key={intent.id} className={styles.intentCard}>
                  <div className={styles.intentTop}>
                    <span className={`${styles.sideBadge} ${styles[`side_${intent.side}`]}`}>
                      {intent.side}
                    </span>
                    <span className={styles.intentMarket}>{intent.market?.replace(/_/g, ' ')}</span>
                    <span className={styles.intentExpiry}>{timeUntil(intent.expires_at)}</span>
                  </div>
                  <div className={styles.intentType}>{intent.intent_type?.replace(/_/g, ' ')}</div>
                  <div className={styles.intentPosted}>Posted {timeAgo(intent.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Markets & capabilities */}
        {((agent?.markets?.length ?? 0) > 0 || (agent?.capabilities?.length ?? 0) > 0) && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>Agent card</div>
            </div>
            {(agent?.markets?.length ?? 0) > 0 && (
              <div className={styles.agentCardRow}>
                <div className={styles.agentCardLabel}>Markets</div>
                <div className={styles.tagList}>
                  {agent!.markets.map((m) => <span key={m} className={styles.tag}>{m.replace(/_/g, ' ')}</span>)}
                </div>
              </div>
            )}
            {(agent?.capabilities?.length ?? 0) > 0 && (
              <div className={styles.agentCardRow}>
                <div className={styles.agentCardLabel}>Capabilities</div>
                <div className={styles.tagList}>
                  {agent!.capabilities.map((c) => <span key={c} className={styles.tag}>{c}</span>)}
                </div>
              </div>
            )}
          </section>
        )}

      </main>
    </div>
  )
}

// ── Root ─────────────────────────────────────────────────────────────────────

const TOKEN_KEY = 'm3x_token'

export default function DashboardPage() {
  const [token, setToken] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY)
    setToken(stored)
    setReady(true)
  }, [])

  const handleConnect = (t: string) => {
    localStorage.setItem(TOKEN_KEY, t)
    setToken(t)
  }

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
  }

  if (!ready) return null

  if (!token) return <ConnectScreen onConnect={handleConnect} />
  return <Dashboard token={token} onLogout={handleLogout} />
}
