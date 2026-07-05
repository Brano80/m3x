import type { Metadata } from 'next'
import Link from 'next/link'
import { getServiceClient } from '@/lib/supabase'
import LibraryClient, { type CardRow } from './LibraryClient'
import styles from './page.module.css'

export const metadata: Metadata = {
  title: 'Library — verified cards for the agentic web | M3X',
  description:
    'One graph of verified JSON cards (business · agent · tool). Structured, claim-verified, MCP-native. Ranked by match, completeness and verification — never by payment.',
  openGraph: {
    title: 'M3X Library — verified cards for the agentic web',
    description:
      'Every card is structured JSON with verified claims and a visible receipt. No pay-to-play. Ever.',
    url: 'https://m3x.space/library',
    siteName: 'M3X',
  },
}

export const revalidate = 3600 // ISR: refresh at most once per hour

export default async function LibraryPage() {
  const supabase = getServiceClient()

  const { data } = await supabase.rpc('library_list_cards', {
    card_type: null,
    verified_only: false,
    list_limit: 50,
    list_offset: 0,
  })

  const cards: CardRow[] = data ?? []
  const totalCount: number = cards.length > 0 ? Number(cards[0].total_count) : 0

  return (
    <div className={styles.root}>
      {/* Nav */}
      <nav className={styles.nav}>
        <a href="/" className={styles.navLogo}>M3X</a>
        <span className={styles.navSlash}>/</span>
        <span className={styles.navTitle}>Library</span>
        <a href="/register" className={styles.navCtaLink}>Get API Key →</a>
      </nav>

      {/* Hero + search + results (client) */}
      <LibraryClient initialCards={cards} totalCount={totalCount} />

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerLeft}>
          <span className={styles.logoMark}>M3X</span>
          <span className={styles.footerSub}>Agentic Matchmaking Network</span>
        </div>
        <div className={styles.footerLinks}>
          <a href="/library">Library</a>
          <a href="https://m3x.space/api/openapi" target="_blank" rel="noopener noreferrer">API</a>
          <a href="https://www.npmjs.com/package/m3x-mcp-server" target="_blank" rel="noopener noreferrer">npm</a>
          <a href="/toolradar">Tool Radar</a>
          <a href="/integrations/microsoft">Microsoft</a>
        </div>
      </footer>
    </div>
  )
}
