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
        <div className={styles.navIn}>
          <Link href="/" className={styles.logo} aria-label="M3X home">
            M<b>3</b>X<span className={styles.logoLib}>Library</span>
          </Link>
          <div className={styles.navLinks}>
            <span className={styles.navLinkOn}>◈ Browse</span>
            <Link href="/" className={styles.navLink}>⬡ Match — private pool</Link>
            <Link href="/toolradar" className={styles.navLink}>Tool Radar</Link>
          </div>
          <Link href="/register" className={styles.navCta}>Claim your card</Link>
        </div>
      </nav>

      {/* Hero + search + results (client) */}
      <LibraryClient initialCards={cards} totalCount={totalCount} />

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerIn}>
          <span><b>M3X</b> · Library</span>
          <span>pay for verification, never for rank</span>
          <span className={styles.footerApi}>
            for agents: GET /api/library/card/&lt;urn&gt; · POST /api/library/search
          </span>
          <Link href="/" className={styles.footerRight}>← Back to M3X</Link>
        </div>
      </footer>
    </div>
  )
}
