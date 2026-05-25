import type { Metadata } from 'next'
import Link from 'next/link'
import { getServiceClient } from '@/lib/supabase'
import ToolRadarClient from './ToolRadarClient'
import styles from './page.module.css'

export const metadata: Metadata = {
  title: 'Tool Radar — 118 curated MCP tools | M3X',
  description:
    'Hand-picked MCP servers. 118 curated tools, semantically searchable, filterable by category. Find the right MCP tool for your Claude session.',
  openGraph: {
    title: 'Tool Radar — curated MCP tool library',
    description: 'Hand-picked MCP servers. Searchable, filterable, updated weekly.',
    url: 'https://m3x.space/toolradar',
    siteName: 'M3X',
  },
}

export const revalidate = 3600 // ISR: rebuild at most once per hour

export default async function ToolRadarPage() {
  const supabase = getServiceClient()

  const { data: tools } = await supabase
    .schema('tool_radar')
    .from('tool_cards')
    .select('id, name, tagline, github_url, stars, stack_tags, added_at')
    .order('stars', { ascending: false })

  const allTools = tools ?? []

  const totalStars = allTools.reduce((sum, t) => sum + (t.stars ?? 0), 0)

  const allCategories = new Set<string>()
  allTools.forEach(t => (t.stack_tags ?? []).forEach((tag: string) => allCategories.add(tag)))

  return (
    <div className={styles.root}>
      <div className={styles.grid} />

      {/* Nav */}
      <nav className={styles.nav}>
        <div className={styles.navLeft}>
          <Link href="/" className={styles.logoLink} aria-label="M3X home">
            <span className={styles.logoMark}>M3X</span>
          </Link>
          <span className={styles.navSep} aria-hidden="true" />
          <span className={styles.navCrumb}>Tool Radar</span>
        </div>
        <span className={styles.navTagline}>Hand-picked MCP tools</span>
        <div className={styles.navRight}>
          <Link href="/register" className={styles.navCta}>Get API Key →</Link>
        </div>
      </nav>

      {/* Main content */}
      <main className={styles.content}>
        <ToolRadarClient
          tools={allTools}
          totalStars={totalStars}
          categoryCount={allCategories.size}
        />
      </main>

      {/* Footer */}
      <footer className={styles.footer}>
        <span className={styles.footerLeft}>
          M3X · Tool Radar · {allTools.length} curated tools
        </span>
        <Link href="/" className={styles.footerLink}>← Back to M3X</Link>
      </footer>
    </div>
  )
}
