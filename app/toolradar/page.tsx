import type { Metadata } from 'next'
import Link from 'next/link'
import { getServiceClient } from '@/lib/supabase'
import ToolRadarClient from './ToolRadarClient'
import styles from './page.module.css'
import SiteFooter from '@/app/components/SiteFooter'

export const metadata: Metadata = {
  title: 'Tool Radar — curated AI tools | M3X',
  description:
    'Hand-picked MCP servers, Claude skills, and AI tools — semantically searchable and filterable by category. Find the right tool for your Claude session.',
  openGraph: {
    title: 'Tool Radar — curated AI tools',
    description: 'Hand-picked MCP servers, Claude skills, and AI tools. Searchable, filterable, updated weekly.',
    url: 'https://m3x.space/toolradar',
    siteName: 'M3X',
  },
}

export const revalidate = 3600 // ISR: refresh at most once per hour

export default async function ToolRadarPage() {
  const supabase = getServiceClient()

  const { data: tools } = await supabase
    .schema('tool_radar')
    .from('tool_cards')
    .select('id, name, tagline, github_url, stars, stack_tags, added_at')
    .order('stars', { ascending: false })

  const allTools = tools ?? []

  const totalStars = allTools.reduce((sum, t) => sum + (t.stars ?? 0), 0)

  // Count only tags that appear on 3+ tools — singletons aren't meaningful categories
  const tagFreq: Record<string, number> = {}
  allTools.forEach(t => (t.stack_tags ?? []).forEach((tag: string) => {
    const n = tag.toLowerCase()
    tagFreq[n] = (tagFreq[n] ?? 0) + 1
  }))
  const allCategories = { size: Object.values(tagFreq).filter(c => c >= 3).length }

  return (
    <div className={styles.root}>
      <div className={styles.grid} />

      {/* Nav */}
      <nav className={styles.nav}>
        <a href="/" className={styles.navLogo}>M3X</a>
        <span className={styles.navSlash}>/</span>
        <span className={styles.navTitle}>Tool Radar</span>
        <a href="/register" className={styles.navCtaLink}>Get API Key →</a>
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
      <SiteFooter />
    </div>
  )
}
