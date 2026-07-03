'use client'

import { useState } from 'react'
import Link from 'next/link'
import styles from './page.module.css'

export interface CardRow {
  urn: string
  type: 'business' | 'agent' | 'tool'
  domain: string
  name: string
  one_liner: string | null
  category: string | null
  capabilities: string[] | null
  serves_markets: string[] | null
  credentials: Credential[] | null
  trust: TrustBlock | null
  trust_score: number
  status: 'unclaimed' | 'claimed' | 'verified'
  callable: unknown
  similarity?: number
  total_count?: number
}

interface Credential {
  issuer?: string
  name?: string
  tier?: string
  status?: string
}

interface TrustBlock {
  basis_string?: string
  evidence_score?: number
  reputation_score?: number | string
  trust_score?: number
}

interface Props {
  initialCards: CardRow[]
  totalCount: number
}

const TYPES = ['all', 'business', 'agent', 'tool'] as const

function ringClass(score: number): string {
  if (score >= 70) return styles.ringHi
  if (score >= 40) return styles.ringMid
  return styles.ringLo
}

export default function LibraryClient({ initialCards, totalCount }: Props) {
  const [query, setQuery] = useState('')
  const [type, setType] = useState<(typeof TYPES)[number]>('all')
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [results, setResults] = useState<CardRow[]>(initialCards)
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function runSearch(overrideType?: string, overrideVerified?: boolean) {
    const q = query.trim()
    const t = overrideType ?? type
    const v = overrideVerified ?? verifiedOnly
    if (!q) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/library/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          type: t === 'all' ? undefined : t,
          verified_only: v,
          limit: 20,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error?.message ?? 'Search failed')
      } else {
        setResults(json.results ?? [])
        setSearched(true)
      }
    } catch {
      setError('Network error — try again')
    } finally {
      setLoading(false)
    }
  }

  const shown = searched
    ? results
    : results.filter(
        c => (type === 'all' || c.type === type) && (!verifiedOnly || c.status === 'verified')
      )

  return (
    <>
      <div className={styles.hero}>
        <div className={styles.kicker}>One graph of verified cards · MCP native</div>
        <h1 className={styles.heroTitle}>Find a business an agent can trust</h1>
        <p className={styles.heroSub}>
          Every card is structured JSON with verified claims and a visible receipt — readable,
          represented, or callable. No pay-to-play. Ever.
        </p>
        <div className={styles.searchbar}>
          <input
            className={styles.searchInput}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && runSearch()}
            placeholder="e.g. HubSpot RevOps agency for B2B SaaS in the US"
            aria-label="Search the library by intent"
          />
          <button className={styles.searchBtn} onClick={() => runSearch()} disabled={loading}>
            {loading ? '…' : 'Search'}
          </button>
        </div>
      </div>

      <div className={styles.main}>
        <section className={styles.resultsCol}>
          <div className={styles.filters}>
            {TYPES.map(t => (
              <button
                key={t}
                className={t === type ? styles.chipOn : styles.chip}
                onClick={() => {
                  setType(t)
                  if (searched) runSearch(t)
                }}
              >
                {t === 'all' ? 'all types' : `type: ${t}`}
              </button>
            ))}
            <label className={styles.vtoggle}>
              verified only
              <input
                type="checkbox"
                checked={verifiedOnly}
                onChange={e => {
                  setVerifiedOnly(e.target.checked)
                  if (searched) runSearch(undefined, e.target.checked)
                }}
              />
            </label>
          </div>

          <div className={styles.resCount}>
            {searched ? (
              <>
                <b>{shown.length}</b> cards · ranked by match · trust — <b>never by payment</b>
              </>
            ) : (
              <>
                <b>{shown.length} of {totalCount}</b> cards · browse or search by intent
              </>
            )}
          </div>

          {error && <div className={styles.error}>{error}</div>}

          {shown.map((c, i) => (
            <div key={c.urn} className={i === 0 && searched ? styles.cardTop : styles.card}>
              {searched && <div className={styles.rank}>#{i + 1}</div>}
              <div className={styles.chead}>
                <div className={styles.avatar}>◈</div>
                <div className={styles.cid}>
                  <h3 className={styles.cardName}>
                    <Link href={`/library/${encodeURIComponent(c.urn)}`} className={styles.cardLink}>
                      {c.name}
                    </Link>
                    <span className={styles.typeTag}>{c.type}</span>
                  </h3>
                  {c.one_liner && <div className={styles.oneliner}>{c.one_liner}</div>}
                  <div className={styles.urn}>{c.urn}</div>
                </div>
                <div className={styles.tscore}>
                  <div
                    className={`${styles.ring} ${ringClass(c.trust_score)}`}
                    style={{ ['--v' as string]: c.trust_score }}
                  >
                    <span>{c.trust_score}</span>
                  </div>
                  <div className={styles.tscoreLbl}>TRUST</div>
                </div>
              </div>

              <div className={styles.badges}>
                {(c.credentials ?? []).slice(0, 3).map((cr, j) => (
                  <span key={j} className={cr.status === 'confirmed' ? styles.bConf : styles.bUnc}>
                    {cr.status === 'confirmed' ? '✓' : '◌'} {cr.issuer} {cr.tier && cr.tier !== '—' ? cr.tier : cr.name}
                    {cr.status === 'confirmed' ? ' — confirmed' : ' — unconfirmed'}
                  </span>
                ))}
                {c.status === 'unclaimed' && (
                  <span className={styles.bUnc}>◌ unclaimed — auto-generated card</span>
                )}
                <span className={styles.bRung}>
                  ● {c.callable ? 'callable' : 'readable'}
                </span>
                {(c.capabilities ?? []).slice(0, 3).map(cap => (
                  <span key={cap} className={styles.bFacet}>{cap}</span>
                ))}
                {typeof c.similarity === 'number' && (
                  <span className={styles.bFacet}>match {c.similarity.toFixed(2)}</span>
                )}
              </div>

              {c.trust?.basis_string && (
                <div className={styles.basis}>
                  <span className={styles.basisLbl}>RECEIPT</span>
                  {c.trust.basis_string}
                </div>
              )}

              {c.status === 'unclaimed' && (
                <div className={styles.claimCta}>
                  Is this yours?{' '}
                  <Link href="/register">Claim this card free →</Link>{' '}
                  control your facts · get verified · never pay for rank
                </div>
              )}
            </div>
          ))}

          {shown.length === 0 && !loading && (
            <div className={styles.empty}>
              No cards match. The library is filling — businesses land here as the crawler and
              claim flow ship.
            </div>
          )}
        </section>

        <aside className={styles.sidebar}>
          <div className={styles.panel}>
            <h4 className={styles.panelH}>⬡ Match — private pool</h4>
            <p className={styles.panelText}>
              Sensitive intent? The library is the public directory. The private pool matches
              structured intents without revealing them — identity only after mutual handshake.
            </p>
            <Link href="/" className={styles.panelBtn}>Enter the private pool →</Link>
          </div>
          <div className={styles.panel}>
            <h4 className={styles.panelH}>◈ For agents</h4>
            <p className={styles.panelText}>
              Cards are plain JSON. Fetch any card directly:
            </p>
            <div className={styles.mcpBox}>GET /api/library/card/&lt;urn&gt;</div>
            <div className={styles.mcpBox}>POST /api/library/search {'{ query }'}</div>
          </div>
          <div className={styles.panel}>
            <h4 className={styles.panelH}>◈ The ladder</h4>
            <div className={styles.kv}><span>● readable</span><span>free — facts to read</span></div>
            <div className={styles.kv}><span>◐ represented</span><span>a thing to ask</span></div>
            <div className={styles.kv}><span>○ callable</span><span>a thing to call + pay</span></div>
            <p className={styles.panelNote}>
              Same card, three rungs. Graduating is a data change, not a rebuild.
            </p>
          </div>
        </aside>
      </div>
    </>
  )
}
