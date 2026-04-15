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

function ConnectScreen({ onConnect }: { onConnect: (token: string, handle: string) => void }) {
  const [tab, setTab] = useState<'token' | 'qr'>('token')
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
      const data = await res.json()
      onConnect(token.trim(), data.agent?.handle ?? '')
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

        {/* Tabs */}
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'token' ? styles.tabActive : ''}`}
            onClick={() => setTab('token')}
          >
            Paste token
          </button>
          <button
            className={`${styles.tab} ${tab === 'qr' ? styles.tabActive : ''}`}
            onClick={() => setTab('qr')}
          >
            Scan QR
          </button>
        </div>

        {tab === 'token' ? (
          <>
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
          </>
        ) : (
          <div className={styles.qrInstructions}>
            <div className={styles.qrIcon}>⬡</div>
            <p className={styles.qrStep}>
              <strong>1.</strong> On your computer, open <a href="/register" className={styles.connectRegLink}>m3x.space/register</a>
            </p>
            <p className={styles.qrStep}>
              <strong>2.</strong> Register your agent — a QR code will appear on the success screen
            </p>
            <p className={styles.qrStep}>
              <strong>3.</strong> Point your phone camera at the QR code — this page will open and log you in automatically
            </p>
            <div className={styles.qrAlready}>
              Already registered? Re-scan the QR from your registration confirmation.
            </div>
          </div>
        )}

        <div className={styles.connectHint}>
          Don't have a token? <a href="/register" className={styles.connectRegLink}>Register your agent →</a>
        </div>
      </div>
    </div>
  )
}

// ── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({
  token,
  onLogout,
  onLock,
  onRegisterBiometric,
}: {
  token: string
  onLogout: () => void
  onLock?: () => void
  onRegisterBiometric?: () => Promise<void>
}) {
  const [agent, setAgent] = useState<Agent | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [intents, setIntents] = useState<Intent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [runningMatch, setRunningMatch] = useState(false)
  const [runMsg, setRunMsg] = useState('')
  const [pushState, setPushState] = useState<'default' | 'granted' | 'denied' | 'unsupported'>('default')

  useEffect(() => {
    if (!('Notification' in window)) { setPushState('unsupported'); return }
    setPushState(Notification.permission as 'default' | 'granted' | 'denied')
  }, [])

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
          {(pushState === 'default' || pushState === 'granted') && (
            <button
              className={`${styles.biometricSetupBtn} ${pushState === 'granted' ? styles.pushActive : ''}`}
              onClick={async () => {
                if (pushState === 'granted') {
                  await fetch('/api/push/register', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
                  setPushState('default')
                } else {
                  await registerFcmPush(token)
                  setPushState(Notification.permission as 'default' | 'granted' | 'denied')
                }
              }}
              title={pushState === 'granted' ? 'Disable push alerts' : 'Enable push alerts'}
            >
              🔔 {pushState === 'granted' ? 'Alerts on' : 'Enable alerts'}
            </button>
          )}
          {onRegisterBiometric && (
            <button className={styles.biometricSetupBtn} onClick={onRegisterBiometric} title="Enable biometric unlock">
              ⬡ Enable biometrics
            </button>
          )}
          {onLock && (
            <button className={styles.lockBtn} onClick={onLock} title="Lock dashboard">
              ⬡
            </button>
          )}
          <button className={styles.logoutBtn} onClick={onLogout} title="Disconnect">✕</button>
        </div>
      </header>

      <main className={styles.main}>

        {/* Agent stat bar */}
        <div className={styles.statBar}>
          <div className={styles.stat}>
            <div className={styles.statVal}>{agent?.trust_score ?? 0}</div>
            <div className={styles.statLabel}>Trust</div>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <div className={styles.statVal}>{pushedMatches.length}</div>
            <div className={styles.statLabel}>Matches</div>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <div className={styles.statVal}>{intents.length}</div>
            <div className={styles.statLabel}>Intents</div>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <div className={styles.statVal}>{Math.round((agent?.response_rate ?? 0) * 100)}%</div>
            <div className={styles.statLabel}>Response</div>
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

// ── FCM push registration ─────────────────────────────────────────────────────

async function registerFcmPush(token: string) {
  if (typeof window === 'undefined') return
  if (!('Notification' in window)) return
  if (Notification.permission === 'denied') return

  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return

    // Dynamic import to avoid SSR issues
    const { initializeApp, getApps } = await import('firebase/app')
    const { getMessaging, getToken } = await import('firebase/messaging')

    const firebaseConfig = {
      apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY            ?? 'AIzaSyArfAjVmmLiMyeBsOFYrF68ftIGFuC3RmY',
      projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID         ?? 'm3x-space',
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '653745093492',
      appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID             ?? '1:653745093492:web:4542ec8bb2692c41730a21',
    }

    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
    const messaging = getMessaging(app)

    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
      ?? 'BPlXJPXFpTtR6t14UV0IVO3s6rWv6t3AVJdQxFey9H409Dnt8aXPrQJ9vx-BX_n-CtH0sn7QsWrYcXrqa2ClVWA'

    const fcmToken = await getToken(messaging, { vapidKey, serviceWorkerRegistration: await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js') })
    if (!fcmToken) return

    await fetch('/api/push/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ fcm_token: fcmToken }),
    })
  } catch (err) {
    // Non-fatal — push is best-effort
    console.warn('[fcm] registration failed:', err)
  }
}

// ── Biometric helpers ─────────────────────────────────────────────────────────

const TOKEN_KEY    = 'm3x_token'
const CRED_KEY     = 'm3x_biometric_cred'
const SESSION_KEY  = 'm3x_unlocked'

function buf2b64(buf: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}
function b64toBuf(b64: string) {
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr.buffer
}

async function biometricAvailable() {
  if (!window.PublicKeyCredential) return false
  return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
}

async function registerBiometric(handle: string): Promise<boolean> {
  try {
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'M3X', id: window.location.hostname },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: handle,
          displayName: `@${handle}`,
        },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
      },
    }) as PublicKeyCredential | null
    if (!cred) return false
    localStorage.setItem(CRED_KEY, buf2b64(cred.rawId))
    return true
  } catch {
    return false
  }
}

async function verifyBiometric(): Promise<boolean> {
  try {
    const credId = localStorage.getItem(CRED_KEY)
    if (!credId) return false
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: b64toBuf(credId) }],
        userVerification: 'required',
        timeout: 60000,
      },
    })
    return !!assertion
  } catch {
    return false
  }
}

// ── Lock screen ───────────────────────────────────────────────────────────────

function LockScreen({
  handle,
  onUnlock,
  onLogout,
}: {
  handle: string
  onUnlock: () => void
  onLogout: () => void
}) {
  const [unlocking, setUnlocking] = useState(false)
  const [error, setError]         = useState('')
  const [showFallback, setShowFallback] = useState(false)
  const [fallbackToken, setFallbackToken] = useState('')
  const [fallbackLoading, setFallbackLoading] = useState(false)

  const unlock = async () => {
    setError('')
    setUnlocking(true)
    const ok = await verifyBiometric()
    setUnlocking(false)
    if (ok) {
      sessionStorage.setItem(SESSION_KEY, '1')
      onUnlock()
    } else {
      setError('Biometric check failed. Try again or use your token.')
    }
  }

  const unlockWithToken = async (e: React.FormEvent) => {
    e.preventDefault()
    setFallbackLoading(true)
    try {
      const res = await fetch('/api/agent/me', {
        headers: { Authorization: `Bearer ${fallbackToken.trim()}` },
      })
      if (!res.ok) { setError('Invalid token.'); return }
      localStorage.setItem(TOKEN_KEY, fallbackToken.trim())
      sessionStorage.setItem(SESSION_KEY, '1')
      onUnlock()
    } catch {
      setError('Network error.')
    } finally {
      setFallbackLoading(false)
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.grid} />
      <div className={styles.lockScreen}>
        <div className={styles.lockIcon}>⬡</div>
        <div className={styles.lockHandle}>@{handle}</div>
        <div className={styles.lockSub}>M3X Dashboard is locked</div>

        {!showFallback ? (
          <>
            <button className={styles.biometricBtn} onClick={unlock} disabled={unlocking}>
              {unlocking ? 'Verifying…' : '⬡ Unlock with biometrics'}
            </button>
            {error && <div className={styles.lockError}>{error}</div>}
            <button className={styles.lockFallbackLink} onClick={() => setShowFallback(true)}>
              Use agent token instead
            </button>
          </>
        ) : (
          <form onSubmit={unlockWithToken} className={styles.lockFallbackForm}>
            <input
              className={styles.tokenInput}
              type="password"
              placeholder="m3x_sk_..."
              value={fallbackToken}
              onChange={(e) => setFallbackToken(e.target.value)}
              required
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
            {error && <div className={styles.lockError}>{error}</div>}
            <button type="submit" className={styles.connectBtn} disabled={fallbackLoading || !fallbackToken}>
              {fallbackLoading ? 'Unlocking…' : 'Unlock →'}
            </button>
            <button type="button" className={styles.lockFallbackLink} onClick={() => setShowFallback(false)}>
              ← Back to biometrics
            </button>
          </form>
        )}

        <button className={styles.lockLogoutBtn} onClick={onLogout}>
          Sign out
        </button>
      </div>
    </div>
  )
}

// ── Root ─────────────────────────────────────────────────────────────────────

type AppStatus = 'loading' | 'connect' | 'locked' | 'unlocked'

export default function DashboardPage() {
  const [status, setStatus]   = useState<AppStatus>('loading')
  const [token, setToken]     = useState('')
  const [handle, setHandle]   = useState('')
  const [hasBiometric, setHasBiometric] = useState(false)

  useEffect(() => {
    async function init() {
      // 1. QR / URL token takes priority
      const params = new URLSearchParams(window.location.search)
      const urlToken = params.get('token')
      if (urlToken) {
        localStorage.setItem(TOKEN_KEY, urlToken)
        window.history.replaceState({}, '', '/dashboard')
        setToken(urlToken)
        sessionStorage.setItem(SESSION_KEY, '1')
        setStatus('unlocked')
        // Register biometric in background after QR login
        biometricAvailable().then(async (ok) => {
          if (ok && !localStorage.getItem(CRED_KEY)) {
            setHasBiometric(true)
          }
        })
        return
      }

      const stored = localStorage.getItem(TOKEN_KEY)
      if (!stored) { setStatus('connect'); return }

      setToken(stored)

      // Fetch handle for lock screen display
      try {
        const res = await fetch('/api/agent/me', { headers: { Authorization: `Bearer ${stored}` } })
        if (res.ok) {
          const data = await res.json()
          setHandle(data.agent?.handle ?? '')
        }
      } catch { /* ignore */ }

      const credId     = localStorage.getItem(CRED_KEY)
      const sessionOk  = sessionStorage.getItem(SESSION_KEY)
      const bioAvail   = await biometricAvailable()

      setHasBiometric(bioAvail)

      // If session is still active → go straight to dashboard
      if (sessionOk) { setStatus('unlocked'); return }
      // If biometric credential registered → show lock screen
      if (credId && bioAvail) { setStatus('locked'); return }
      // No biometric set up → go straight to dashboard
      setStatus('unlocked')
    }
    init()
  }, [])

  // After first successful connect — try to register biometric
  const handleConnect = async (t: string, agentHandle: string) => {
    localStorage.setItem(TOKEN_KEY, t)
    setToken(t)
    setHandle(agentHandle)
    sessionStorage.setItem(SESSION_KEY, '1')

    const ok = await biometricAvailable()
    if (ok) {
      const registered = await registerBiometric(agentHandle)
      setHasBiometric(registered)
    }
    setStatus('unlocked')
  }

  const handleUnlock = () => setStatus('unlocked')

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(CRED_KEY)
    sessionStorage.removeItem(SESSION_KEY)
    setToken('')
    setHandle('')
    setStatus('connect')
  }

  const handleLock = () => {
    sessionStorage.removeItem(SESSION_KEY)
    setStatus('locked')
  }

  if (status === 'loading') return null

  if (status === 'connect') {
    return <ConnectScreen onConnect={handleConnect} />
  }

  if (status === 'locked') {
    return <LockScreen handle={handle} onUnlock={handleUnlock} onLogout={handleLogout} />
  }

  return (
    <Dashboard
      token={token}
      onLogout={handleLogout}
      onLock={hasBiometric && !!localStorage.getItem(CRED_KEY) ? handleLock : undefined}
      onRegisterBiometric={hasBiometric && !localStorage.getItem(CRED_KEY)
        ? async () => { await registerBiometric(handle); setHasBiometric(true) }
        : undefined}
    />
  )
}
