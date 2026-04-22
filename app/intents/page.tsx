'use client'

import { useState, useEffect } from 'react'
import styles from './intents.module.css'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawPacket {
  offers?: string
  seeking?: string
  [key: string]: unknown
}

interface Intent {
  id: string
  side: string
  market: string
  intent_type: string
  status: string
  raw_packet: RawPacket | null
  created_at: string
  expires_at: string
  connected: boolean
  connected_count: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TOKEN_KEY = 'm3x_token'

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
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

function intentText(intent: Intent): string {
  const p = intent.raw_packet
  if (!p) return ''
  if (intent.side === 'supply') return typeof p.offers === 'string' ? p.offers : ''
  return typeof p.seeking === 'string' ? p.seeking : ''
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function IntentsPage() {
  const [token, setToken]       = useState('')
  const [intents, setIntents]   = useState<Intent[]>([])
  const [loading, setLoading]   = useState(true)
  const [noToken, setNoToken]   = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    const t = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null
    if (!t) { setNoToken(true); setLoading(false); return }
    setToken(t)
    fetch('/api/intents', { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.ok ? r.json() : { intents: [] })
      .then(d => { setIntents(d.intents ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const deleteIntent = async (id: string) => {
    setDeleting(id)
    try {
      const res = await fetch(`/api/intent/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) setIntents(prev => prev.filter(i => i.id !== id))
    } catch {
      /* ignore */
    } finally {
      setDeleting(null)
    }
  }

  const toggle = (id: string) => setExpanded(prev => prev === id ? null : id)

  if (loading) {
    return (
      <div className={styles.root}>
        <div className={styles.grid} />
        <div className={styles.loadingFull}>Loading…</div>
      </div>
    )
  }

  if (noToken) {
    return (
      <div className={styles.root}>
        <div className={styles.grid} />
        <div className={styles.loadingFull}>
          <div>Connect your agent first.</div>
          <a href="/dashboard" className={styles.goLink}>Go to Dashboard →</a>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <div className={styles.grid} />

      {/* Header */}
      <header className={styles.header}>
        <a href="/" className={styles.headerLogo}>M3X</a>
        <div className={styles.headerNav}>
          <a href="/dashboard" className={styles.navLink}>Dashboard</a>
          <a href="/inbox" className={styles.navLink}>Inbox</a>
          <a href="/intents" className={`${styles.navLink} ${styles.navActive}`}>Intents</a>
        </div>
      </header>

      {/* Content */}
      <main className={styles.main}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>Intents</div>
          </div>

          {intents.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>⬡</div>
              <div className={styles.emptyTitle}>No intents yet</div>
              <div className={styles.emptySub}>
                Post an intent from the dashboard to get matched.
              </div>
              <a href="/dashboard" className={styles.emptyLink}>Go to Dashboard →</a>
            </div>
          ) : (
            <div className={styles.intentList}>
              {intents.map(intent => {
                const isOpen = expanded === intent.id
                const text   = intentText(intent)
                const isActive = intent.status === 'active'
                const isWithdrawn = intent.status === 'withdrawn' || intent.status === 'expired'
                const isConnected = intent.connected
                const connectedCount = intent.connected_count ?? 0

                return (
                  <div key={intent.id} className={`${styles.intentCard} ${isOpen ? styles.intentCardOpen : ''} ${isWithdrawn ? styles.intentCardWithdrawn : ''}`}>
                    {/* Clickable header row */}
                    <div
                      className={styles.intentRow}
                      onClick={() => toggle(intent.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && toggle(intent.id)}
                    >
                      <div className={styles.intentLeft}>
                        <span className={`${styles.intentSide} ${intent.side === 'demand' ? styles.sideDemand : styles.sideSupply}`}>
                          {intent.side === 'demand' ? 'SEEKING' : 'OFFERING'}
                        </span>
                        <div className={styles.intentInfo}>
                          <div className={styles.intentMarket}>
                            {intent.market.replace(/_/g, ' ')}
                          </div>
                          <div className={styles.intentMeta}>
                            {intent.status !== 'active'
                              ? <span className={styles.statusBadge}>{intent.status}</span>
                              : null
                            }
                            {isConnected && (
                              <span className={styles.connectedBadge}>
                                CONNECTED{connectedCount > 1 ? ` ${connectedCount}` : ''}
                              </span>
                            )}
                            Posted {timeAgo(intent.created_at)} · {timeUntil(intent.expires_at)}
                          </div>
                        </div>
                      </div>
                      <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}>›</span>
                    </div>

                    {/* Expanded body */}
                    {isOpen && (
                      <div className={styles.intentBody}>
                        {text ? (
                          <p className={styles.intentText}>{text}</p>
                        ) : (
                          <p className={styles.intentTextEmpty}>No description available.</p>
                        )}
                        {isActive && (
                          <button
                            type="button"
                            className={styles.deleteBtn}
                            onClick={e => { e.stopPropagation(); deleteIntent(intent.id) }}
                            disabled={deleting === intent.id}
                          >
                            {deleting === intent.id ? '…' : 'Withdraw intent'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
