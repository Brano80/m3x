'use client'

import { useState, useRef } from 'react'
import styles from './page.module.css'

interface Check {
  id: string
  name: string
  desc: string
  passed: boolean
  points: number
  maxPoints: number
  hint: string
}

interface Category {
  id: string
  name: string
  checks: Check[]
  score: number
  maxScore: number
}

interface ScanResult {
  url: string
  domain: string
  meta: { title: string; description: string }
  score: number
  maxScore: number
  categories: Category[]
  prompt: string
  scannedAt: string
}

function ScoreBar({ score, max }: { score: number; max: number }) {
  const pct = Math.round((score / max) * 100)
  const colour = pct >= 70 ? 'var(--m3x-blue)' : pct >= 40 ? '#f59e0b' : '#ef4444'
  return (
    <div className={styles.scoreBarWrap}>
      <div className={styles.scoreBarTrack}>
        <div className={styles.scoreBarFill} style={{ width: `${pct}%`, background: colour }} />
      </div>
    </div>
  )
}

function ScoreLabel({ score }: { score: number }) {
  if (score >= 70) return <span className={styles.scoreLabelGood}>Agent-ready ✓</span>
  if (score >= 50) return <span className={styles.scoreLabelMid}>Partial coverage</span>
  return <span className={styles.scoreLabelBad}>Not agent-ready</span>
}

const SOCIAL_DOMAINS: Record<string, { name: string; icon: string }> = {
  'facebook.com':  { name: 'Facebook',  icon: 'f' },
  'fb.com':        { name: 'Facebook',  icon: 'f' },
  'instagram.com': { name: 'Instagram', icon: '◎' },
  'twitter.com':   { name: 'X / Twitter', icon: '𝕏' },
  'x.com':         { name: 'X / Twitter', icon: '𝕏' },
  'linkedin.com':  { name: 'LinkedIn',  icon: 'in' },
  'tiktok.com':    { name: 'TikTok',    icon: '♪' },
  'youtube.com':   { name: 'YouTube',   icon: '▶' },
  'pinterest.com': { name: 'Pinterest', icon: '𝗣' },
  'snapchat.com':  { name: 'Snapchat',  icon: '👻' },
}

function detectSocial(raw: string): { platform: string; handle: string } | null {
  try {
    let s = raw.trim()
    if (!s.startsWith('http')) s = 'https://' + s
    const u = new URL(s)
    const host = u.hostname.replace(/^www\./, '')
    const social = SOCIAL_DOMAINS[host]
    if (!social) return null
    // Try to extract handle from path: /acmecompany → acmecompany
    const handle = u.pathname.replace(/^\//, '').split('/')[0].split('?')[0] || ''
    return { platform: social.name, handle }
  } catch {
    return null
  }
}

export default function AeoPage() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [social, setSocial] = useState<{ platform: string; handle: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [copiedBadge, setCopiedBadge] = useState(false)
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())
  const resultRef = useRef<HTMLDivElement>(null)

  async function runScan(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return

    // Detect social media URLs before hitting the API
    const detected = detectSocial(url)
    if (detected) {
      setSocial(detected)
      setResult(null)
      setError('')
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
      return
    }

    setSocial(null)
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch('/api/aeo/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error?.message ?? 'Scan failed. Try again.')
        return
      }
      setResult(data)
      setExpandedCats(new Set(data.categories.map((c: Category) => c.id)))
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } catch {
      setError('Network error. Check the domain and try again.')
    } finally {
      setLoading(false)
    }
  }

  function toggleCat(id: string) {
    setExpandedCats(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function copyPrompt() {
    if (!result) return
    navigator.clipboard.writeText(result.prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const scorePct = result ? Math.round((result.score / result.maxScore) * 100) : 0
  const scoreColour = scorePct >= 70 ? 'var(--m3x-blue)' : scorePct >= 40 ? '#f59e0b' : '#ef4444'

  return (
    <div className={styles.root}>
      <div className={styles.grid} />

      {/* Nav */}
      <nav className={styles.nav}>
        <a href="/" className={styles.navLogo}>M3X</a>
        <span className={styles.navSep}>/</span>
        <span className={styles.navTitle}>AEO Scanner</span>
        <a href="/register" className={styles.navCta}>Get API Key →</a>
      </nav>

      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles.heroBadge}>Agent Engine Optimisation</div>
        <h1 className={styles.heroTitle}>
          Is your website<br />
          <span className={styles.accent}>visible to AI agents?</span>
        </h1>
        <p className={styles.heroSub}>
          Scan any domain. See exactly which agent-readiness standards you pass or fail.
          Get a ready-to-use fix prompt for Claude, Cursor, or any AI coding tool.
        </p>

        <form className={styles.scanForm} onSubmit={runScan}>
          <div className={styles.inputRow}>
            <input
              className={styles.input}
              type="text"
              placeholder="yourdomain.com"
              value={url}
              onChange={e => setUrl(e.target.value)}
              disabled={loading}
              autoFocus
              spellCheck={false}
            />
            <button className={styles.scanBtn} type="submit" disabled={loading || !url.trim()}>
              {loading ? <span className={styles.spinner} /> : 'Scan →'}
            </button>
          </div>
          {error && <p className={styles.errorMsg}>{error}</p>}
        </form>

        <p className={styles.heroNote}>
          Free · No login required
        </p>
      </section>

      {/* Social media detected */}
      {social && (
        <div className={styles.results} ref={resultRef}>
          <div className={styles.socialCard}>
            <div className={styles.socialIcon}>◈</div>
            <div className={styles.socialBody}>
              <div className={styles.socialTitle}>
                {social.platform} profiles can't be made agent-ready directly
              </div>
              <div className={styles.socialDesc}>
                Social media pages live on someone else's infrastructure — you can't add
                the protocols AI agents look for (<code>llms.txt</code>, MCP endpoints,
                identity files). No matter how optimised your {social.platform} page is,
                it's invisible to AI agents browsing the open web.
              </div>
              <div className={styles.socialFix}>
                <div className={styles.socialFixTitle}>The fix</div>
                <div className={styles.socialFixDesc}>
                  Register on M3X and get a free agent-discoverable profile — visible to AI agents
                  even if your only web presence is {social.platform}.
                  It takes 30 seconds and requires no code or website.
                </div>
              </div>
            </div>
          </div>

          {/* M3X CTA — commented out pending repositioning */}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className={styles.results} ref={resultRef}>

          {/* Score hero */}
          <div className={styles.scoreHero}>
            <div className={styles.scoreLeft}>
              <div className={styles.scoreDomain}>{result.domain}</div>
              <div className={styles.scoreNumRow}>
                <span className={styles.scoreNum} style={{ color: scoreColour }}>{result.score}</span>
                <span className={styles.scoreMax}>/ {result.maxScore}</span>
              </div>
              <ScoreLabel score={scorePct} />
            </div>
            <div className={styles.scoreRight}>
              <ScoreBar score={result.score} max={result.maxScore} />
              <div className={styles.scoreMeta}>
                {result.meta.title && <span className={styles.scoreMetaTitle}>{result.meta.title}</span>}
                <span className={styles.scoreMetaTime}>Scanned {new Date(result.scannedAt).toLocaleTimeString()}</span>
              </div>
            </div>
          </div>

          {/* Categories */}
          <div className={styles.cats}>
            {result.categories.map(cat => {
              const pct = Math.round((cat.score / cat.maxScore) * 100)
              const isOpen = expandedCats.has(cat.id)
              const allPass = cat.score === cat.maxScore
              return (
                <div key={cat.id} className={`${styles.catCard} ${allPass ? styles.catCardPass : ''}`}>
                  <button className={styles.catHeader} onClick={() => toggleCat(cat.id)}>
                    <span className={styles.catName}>{cat.name}</span>
                    <span className={styles.catScore} style={{ color: pct >= 70 ? 'var(--m3x-blue)' : pct >= 40 ? '#f59e0b' : '#ef4444' }}>
                      {cat.score}/{cat.maxScore}
                    </span>
                    <div className={styles.catBarMini}>
                      <div className={styles.catBarFill} style={{ width: `${pct}%`, background: pct >= 70 ? 'var(--m3x-blue)' : pct >= 40 ? '#f59e0b' : '#ef4444' }} />
                    </div>
                    <span className={styles.catToggle}>{isOpen ? '↑' : '↓'}</span>
                  </button>

                  {isOpen && (
                    <div className={styles.checkList}>
                      {cat.checks.map(check => (
                        <div key={check.id} className={`${styles.checkRow} ${check.passed ? styles.checkPass : styles.checkFail}`}>
                          <span className={styles.checkIcon}>{check.passed ? '✓' : '✗'}</span>
                          <div className={styles.checkBody}>
                            <span className={styles.checkName}>{check.name}</span>
                            <span className={styles.checkDesc}>{check.desc}</span>
                            {!check.passed && <span className={styles.checkHint}>{check.hint}</span>}
                          </div>
                          <span className={styles.checkPts}>{check.passed ? `+${check.maxPoints}` : `0/${check.maxPoints}`}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Fix prompt */}
          {result.score < result.maxScore && (
            <div className={styles.fixSection}>
              <div className={styles.fixHeader}>
                <div>
                  <div className={styles.fixTitle}>Fix this instantly</div>
                  <div className={styles.fixSub}>
                    Copy the prompt below and paste it into Claude, Cursor, Windsurf, or any AI coding assistant.
                    It adds all missing files to your codebase automatically.
                  </div>
                </div>
                <button className={styles.copyBtn} onClick={copyPrompt}>
                  {copied ? '✓ Copied' : 'Copy prompt'}
                </button>
              </div>
              <pre className={styles.promptPre}>{result.prompt}</pre>
            </div>
          )}

          {result.score === result.maxScore && (
            <div className={styles.perfectScore}>
              <span className={styles.perfectIcon}>◈</span>
              <div>
                <div className={styles.perfectTitle}>Perfect score</div>
                <div className={styles.perfectSub}>This site is fully agent-ready across all 25 checks.</div>
              </div>
            </div>
          )}

          {/* Badge embed — show for any score ≥ 70 */}
          {scorePct >= 70 && (
            <div className={styles.badgeSection}>
              <div className={styles.badgeTitle}>Add a badge to your site</div>
              <div className={styles.badgeRow}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/aeo/badge?score=${result.score}&max=${result.maxScore}&domain=${result.domain}`}
                  alt="M3X Agent-Ready badge"
                  height={20}
                  className={styles.badgePreview}
                />
                <button
                  className={styles.badgeCopyBtn}
                  onClick={() => {
                    const code = `<a href="https://m3x.space/aeo" title="AEO score by M3X"><img src="https://m3x.space/api/aeo/badge?score=${result.score}&max=${result.maxScore}&domain=${result.domain}" alt="M3X Agent-Ready" height="20" /></a>`
                    navigator.clipboard.writeText(code)
                    setCopiedBadge(true)
                    setTimeout(() => setCopiedBadge(false), 2500)
                  }}
                >
                  {copiedBadge ? '✓ Copied' : 'Copy embed code'}
                </button>
              </div>
            </div>
          )}

          {/* M3X CTA — commented out pending repositioning
          <div className={styles.ctaDivider}>
            <span className={styles.ctaDividerLine} />
            <span className={styles.ctaDividerText}>go further</span>
            <span className={styles.ctaDividerLine} />
          </div>
          <div className={styles.m3xCta}>
            <div className={styles.m3xCtaLeft}>
              <div className={styles.m3xCtaTitle}>Get a free agent presence on M3X</div>
              <div className={styles.m3xCtaSub}>
                When an AI agent is looking for what you offer, M3X matches it to your business
                and sends it your way. Free. No code required.
              </div>
            </div>
            <a href={`/register/business?domain=${result.domain}`} className={styles.m3xCtaBtn}>
              Activate free presence →
            </a>
          </div>
          */}

        </div>
      )}

      {/* What we check */}
      {!result && (
        <section className={styles.checksInfo}>
          <div className={styles.checksInfoTitle}>25 checks across 5 categories</div>
          <div className={styles.checksInfoGrid}>
            {[
              { label: 'Discoverability', items: ['robots.txt', 'llms.txt', 'agents.md', 'Sitemap', 'Link Headers'] },
              { label: 'Content Signals', items: ['Markdown Negotiation', 'JSON-LD', 'Content Signals', 'AI Bot Rules'] },
              { label: 'Agent Protocols', items: ['MCP Endpoint', 'Agent Card', 'AI Catalog', 'API Catalog', 'Agent Skills', 'UCP'] },
              { label: 'Identity & Auth', items: ['A2A Agent Card', 'OAuth Resource', 'DID Document', 'Web Bot Auth', 'Agent Permissions'] },
              { label: 'Commerce', items: ['x402 Payments', 'MCP Server Card'] },
            ].map(cat => (
              <div key={cat.label} className={styles.checksInfoCard}>
                <div className={styles.checksInfoCat}>{cat.label}</div>
                {cat.items.map(item => (
                  <div key={item} className={styles.checksInfoItem}>◈ {item}</div>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className={styles.footer}>
        <span className={styles.footerLogo}>M3X</span>
        <span className={styles.footerSep}>·</span>
        <a href="/" className={styles.footerLink}>Agentic Matchmaking Network</a>
        <span className={styles.footerSep}>·</span>
        <a href="/register" className={styles.footerLink}>Get API Key</a>
      </footer>
    </div>
  )
}
