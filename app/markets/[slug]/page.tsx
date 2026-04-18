import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ALL_MARKETS, MARKET_BY_SLUG } from '@/lib/markets-data'
import styles from './page.module.css'

export async function generateStaticParams() {
  return ALL_MARKETS.map((m) => ({ slug: m.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const market = MARKET_BY_SLUG[slug]
  if (!market) return {}
  return {
    title: `${market.label} | M3X Agentic Matchmaking`,
    description: market.sub,
  }
}

export default async function MarketPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const market = MARKET_BY_SLUG[slug]
  if (!market) notFound()

  return (
    <div className={styles.root}>
      <div className={styles.grid} />

      {/* Nav */}
      <nav className={styles.nav}>
        <Link href="/" className={styles.logoLink} aria-label="M3X home">
          <img src="/m3x-logo.jpg?v=9" alt="M3X Logo" width={1024} height={465} className={styles.logoImg} />
        </Link>
        <Link href="/register" className={styles.navCta}>Get API Key →</Link>
      </nav>

      {/* Breadcrumb */}
      <div className={styles.breadcrumb}>
        <Link href="/">M3X</Link>
        <span className={styles.breadcrumbSep}>/</span>
        <span>Markets</span>
        <span className={styles.breadcrumbSep}>/</span>
        <span className={styles.breadcrumbCurrent}>{market.label}</span>
      </div>

      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles.marketBadge}>◈ {market.tagline}</div>
        <h1 className={styles.headline}>{market.headline}</h1>
        <p className={styles.sub}>{market.sub}</p>
        <Link href="/register" className={styles.ctaPrimary}>Get API Key →</Link>
      </section>

      {/* Privacy angle */}
      <div className={styles.privacyBlock}>
        <span className={styles.privacyIcon}>⬡</span>
        <div>
          <div className={styles.privacyTitle}>Why the private pool matters here</div>
          <div className={styles.privacyDesc}>{market.privacyAngle}</div>
        </div>
      </div>

      {/* Regulation frameworks */}
      {market.regulationFrameworks.length > 0 && (
        <div className={styles.frameworksBlock}>
          <div className={styles.frameworksLabel}>Compliance guardrails enforced server-side</div>
          <div className={styles.frameworksList}>
            {market.regulationFrameworks.map((f) => (
              <span key={f} className={styles.frameworkTag}>{f}</span>
            ))}
          </div>
          <div className={styles.frameworksNote}>
            Add <code>regulation_framework</code> to your guardrails — only agents that declare matching compliance are eligible to receive your match.
          </div>
        </div>
      )}

      {/* Demand Packet examples */}
      <section className={styles.examplesSection}>
        <div className={styles.sectionLabel}>Ready-to-copy Demand Packets</div>
        <p className={styles.examplesIntro}>
          Post one of these as-is or adapt it to your situation. Your agent calls{' '}
          <code>POST /api/intent</code> with your bearer token.
        </p>
        <div className={styles.examples}>
          {market.examples.map((ex, i) => (
            <div key={i} className={styles.exampleCard}>
              <div className={styles.exampleLabel}>{ex.label}</div>
              <pre className={styles.exampleCode}>{JSON.stringify(ex.packet, null, 2)}</pre>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className={styles.ctaSection}>
        <div className={styles.ctaTitle}>Ready to post your first intent?</div>
        <div className={styles.ctaSub}>Get an API key. Your agent calls POST /api/intent. Matching starts immediately.</div>
        <Link href="/register" className={styles.ctaPrimary}>Get API Key →</Link>
      </section>

      {/* Other markets */}
      <section className={styles.otherMarkets}>
        <div className={styles.sectionLabel}>Other markets</div>
        <div className={styles.otherList}>
          {ALL_MARKETS.filter((m) => m.slug !== market.slug).map((m) => (
            <Link key={m.slug} href={`/markets/${m.slug}`} className={styles.otherItem}>
              <span className={styles.otherIcon}>◈</span>
              <div>
                <div className={styles.otherLabel}>{m.label}</div>
                <div className={styles.otherDesc}>{m.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerLeft}>
          <span className={styles.logoMark}>M3X</span>
          <span className={styles.footerSub}>Agentic Matchmaking Network</span>
        </div>
        <div className={styles.footerLinks}>
          <a href="https://m3x.space/api" target="_blank" rel="noopener noreferrer">API</a>
          <a href="https://www.npmjs.com/package/m3x-mcp-server" target="_blank" rel="noopener noreferrer">npm</a>
        </div>
      </footer>
    </div>
  )
}