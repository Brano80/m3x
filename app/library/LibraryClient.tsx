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
const PAGE_SIZE = 50

function trustClass(score: number): string {
  if (score >= 70) return styles.tnumHi
  if (score >= 40) return styles.tnumMid
  return styles.tnumLo
}

export default function LibraryClient({ initialCards, totalCount }: Props) {
  const [query, setQuery] = useState('')
  const [type, setType] = useState<(typeof TYPES)[number]>('all')
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [results, setResults] = useState<CardRow[]>([])
  const [browseCards, setBrowseCards] = useState<CardRow[]>(initialCards)
  const [browseTotal, setBrowseTotal] = useState(totalCount)
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)
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
    setExpanded(null)
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

  async function loadBrowse(t: string, v: boolean, p: number) {
    setLoading(true)
    setError(null)
    setExpanded(null)
    try {
      const params = new URLSearchParams()
      if (t !== 'all') params.set('type', t)
      if (v) params.set('verified_only', 'true')
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String(p * PAGE_SIZE))
      const res = await fetch(`/api/library/list?${params.toString()}`)
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error?.message ?? 'Load failed')
      } else {
        setBrowseCards(json.results ?? [])
        setBrowseTotal(json.total ?? 0)
        setPage(p)
        setSearched(false)
      }
    } catch {
      setError('Network error — try again')
    } finally {
      setLoading(false)
    }
  }

  function onTypeChange(t: (typeof TYPES)[number]) {
    setType(t)
    if (searched && query.trim()) runSearch(t)
    else loadBrowse(t, verifiedOnly, 0)
  }

  function onVerifiedChange(v: boolean) {
    setVerifiedOnly(v)
    if (searched && query.trim()) runSearch(undefined, v)
    else loadBrowse(type, v, 0)
  }

  const shown = searched ? results : browseCards
  const totalPages = Math.max(1, Math.ceil(browseTotal / PAGE_SIZE))

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
                onClick={() => onTypeChange(t)}
              >
                {t === 'all' ? 'all types' : `type: ${t}`}
              </button>
            ))}
            <label className={styles.vtoggle}>
              verified only
              <input
                type="checkbox"
                checked={verifiedOnly}
                onChange={e => onVerifiedChange(e.target.checked)}
              />
            </label>
            {searched && (
              <button
                className={styles.chip}
                onClick={() => {
                  setQuery('')
                  loadBrowse(type, verifiedOnly, 0)
                }}
              >
                ✕ clear search
              </button>
            )}
          </div>

          <div className={styles.resCount}>
            {searched ? (
              <>
                <b>{shown.length}</b> cards · ranked by match · trust — <b>never by payment</b>
              </>
            ) : (
              <>
                <b>
                  {browseTotal === 0
                    ? '0'
                    : `${page * PAGE_SIZE + 1}–${page * PAGE_SIZE + shown.length} of ${browseTotal}`}
                </b>{' '}
                cards · browse or search by intent · sorted by trust
              </>
            )}
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.rows}>
            {shown.map((c, i) => {
              const isOpen = expanded === c.urn
              const cred =
                (c.credentials ?? []).find(cr => cr.status === 'confirmed') ??
                (c.credentials ?? [])[0]
              const region = (c.serves_markets ?? []).slice(0, 2).join(' · ')
              const rightMeta =
                typeof c.similarity === 'number'
                  ? `match ${c.similarity.toFixed(2)}`
                  : region || (c.callable ? 'callable' : '')
              return (
                <div key={c.urn} className={isOpen ? styles.rowOpen : styles.row}>
                  <div
                    className={styles.rowHead}
                    onClick={() => setExpanded(isOpen ? null : c.urn)}
                    role="button"
                    aria-expanded={isOpen}
                  >
                    <div className={c.type === 'tool' ? styles.rowGlyphTool : styles.rowGlyph}>
                      {c.type === 'tool' ? '⬡' : '◈'}
                    </div>
                    <div className={styles.rowName}>
                      <div className={styles.rowTitle}>
                        {searched && <span className={styles.rowRank}>#{i + 1}</span>}
                        {c.name}
                        {c.status === 'verified' && (
                          <span className={styles.rowVerified}>✓ verified</span>
                        )}
                        <span className={styles.typeTag}>{c.type}</span>
                      </div>
                      {c.one_liner && <div className={styles.rowOneliner}>{c.one_liner}</div>}
                    </div>
                    {cred ? (
                      <span
                        className={cred.status === 'confirmed' ? styles.rowCredConf : styles.rowCredNone}
                      >
                        {cred.status === 'confirmed' ? '✓ ' : '◌ '}
                        {cred.issuer} {cred.tier && cred.tier !== '—' ? cred.tier : cred.name}
                      </span>
                    ) : (
                      <span className={styles.rowCredNone}>
                        {c.type === 'tool' ? 'curated · Tool Radar' : 'unclaimed'}
                      </span>
                    )}
                    {rightMeta && <span className={styles.rowGeo}>{rightMeta}</span>}
                    <span className={`${styles.tnum} ${trustClass(c.trust_score)}`}>
                      {c.trust_score}
                    </span>
                    <span className={styles.rowChev}>▶</span>
                  </div>

                  {isOpen && (
                    <div className={styles.rowBody}>
                      {c.trust?.basis_string && (
                        <div className={styles.basis}>
                          <span className={styles.basisLbl}>RECEIPT</span>
                          {c.trust.basis_string}
                        </div>
                      )}
                      {(c.capabilities ?? []).length > 0 && (
                        <div className={styles.rowTags}>
                          {(c.capabilities ?? []).slice(0, 8).map(cap => (
                            <span key={cap} className={styles.bFacet}>{cap}</span>
                          ))}
                        </div>
                      )}
                      <div className={styles.rowUrn}>{c.urn}</div>
                      <div className={styles.rowActions}>
                        <Link href={`/library/${encodeURIComponent(c.urn)}`}>Full card →</Link>
                        <span className={styles.rowJson}>
                          {'{ }'} GET /api/library/card/{c.urn}
                        </span>
                        {c.status === 'unclaimed' && (
                          <Link href="/register" className={styles.rowClaim}>
                            {c.type === 'tool'
                              ? 'Publisher? Claim this card →'
                              : 'Is this yours? Claim free →'}
                          </Link>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {shown.length === 0 && !loading && (
            <div className={styles.empty}>
              No cards match. The library is filling — businesses land here as the crawler and
              claim flow ship.
            </div>
          )}

          {!searched && totalPages > 1 && (
            <div className={styles.pager}>
              <button
                className={styles.pgBtn}
                disabled={page === 0 || loading}
                onClick={() => loadBrowse(type, verifiedOnly, page - 1)}
              >
                ← prev
              </button>
              <span className={styles.pgInfo}>
                page {page + 1} of {totalPages}
              </span>
              <button
                className={styles.pgBtn}
                disabled={page + 1 >= totalPages || loading}
                onClick={() => loadBrowse(type, verifiedOnly, page + 1)}
              >
                next →
              </button>
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
