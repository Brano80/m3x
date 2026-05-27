'use client'

import { useState, useMemo } from 'react'
import styles from './page.module.css'

interface Tool {
  id: string
  name: string
  tagline: string | null
  github_url: string | null
  stars: number | null
  stack_tags: string[] | null
  added_at: string | null
}

interface Props {
  tools: Tool[]
  totalStars: number
  categoryCount: number
}

/** Returns false for raw API endpoints that aren't browsable pages */
function isBrowsableUrl(url: string): boolean {
  try {
    const { pathname } = new URL(url)
    // Block paths that look like API endpoints
    if (/\/(mcp|api|v\d+|rest)(\/|$)/i.test(pathname)) return false
    return true
  } catch {
    return false
  }
}

function fmtStars(n: number | null): string {
  if (!n) return '—'
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(n)
}

export default function ToolRadarClient({ tools, totalStars, categoryCount }: Props) {
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState('All')
  const [sort, setSort] = useState<'stars' | 'name' | 'recent'>('stars')

  // Build sorted tag list by frequency
  const allTags = useMemo(() => {
    const freq: Record<string, number> = {}
    tools.forEach(t => (t.stack_tags ?? []).forEach(tag => {
      freq[tag] = (freq[tag] ?? 0) + 1
    }))
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag)
      .slice(0, 20)
  }, [tools])

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    let result = tools.filter(t => {
      const matchTag = activeTag === 'All' || (t.stack_tags ?? []).includes(activeTag)
      const matchQ = !q ||
        t.name.toLowerCase().includes(q) ||
        (t.tagline ?? '').toLowerCase().includes(q) ||
        (t.stack_tags ?? []).some(tg => tg.toLowerCase().includes(q))
      return matchTag && matchQ
    })

    if (sort === 'stars') result.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
    else if (sort === 'name') result.sort((a, b) => a.name.localeCompare(b.name))
    else if (sort === 'recent') result.sort((a, b) =>
      new Date(b.added_at ?? 0).getTime() - new Date(a.added_at ?? 0).getTime()
    )

    return result
  }, [tools, query, activeTag, sort])

  const fmtTotal = (n: number) => n >= 1000
    ? (n / 1000).toFixed(0) + 'k'
    : String(n)

  return (
    <>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div className={styles.pageLabel}>Tool Radar</div>
        <h1 className={styles.pageTitle}>MCP tool library</h1>
        <p className={styles.pageSub}>
          Hand-picked MCP servers. Curated, not scraped — every tool was spotted and vetted by a human.
        </p>
        <div className={styles.headerStats}>
          <div className={styles.statPill}>
            <span className={styles.statNum}>{tools.length}</span>
            <span className={styles.statLabel}>Tools</span>
          </div>
          <div className={styles.statPill}>
            <span className={styles.statNum}>{categoryCount}</span>
            <span className={styles.statLabel}>Categories</span>
          </div>
          <div className={styles.statPill}>
            <span className={styles.statNum}>{fmtTotal(totalStars)}</span>
            <span className={styles.statLabel}>Total stars</span>
          </div>
          <div className={styles.statPill}>
            <span className={styles.statNum}>Weekly</span>
            <span className={styles.statLabel}>Updated</span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className={styles.controls}>
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>⌕</span>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search tools…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <select
          className={styles.sortSelect}
          value={sort}
          onChange={e => setSort(e.target.value as 'stars' | 'name' | 'recent')}
        >
          <option value="stars">Stars ↓</option>
          <option value="name">Name A–Z</option>
          <option value="recent">Recently added</option>
        </select>
      </div>

      {/* Tag filter bar */}
      <div className={styles.tagBar}>
        <button
          className={`${styles.tagBtn} ${activeTag === 'All' ? styles.tagBtnActive : ''}`}
          onClick={() => setActiveTag('All')}
        >
          All
        </button>
        {allTags.map(tag => (
          <button
            key={tag}
            className={`${styles.tagBtn} ${activeTag === tag ? styles.tagBtnActive : ''}`}
            onClick={() => setActiveTag(tag)}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* Results meta */}
      <div className={styles.resultsMeta}>
        {filtered.length} {filtered.length === 1 ? 'tool' : 'tools'}
        {activeTag !== 'All' && ` · ${activeTag}`}
        {query && ` · "${query}"`}
      </div>

      {/* Grid */}
      <div className={styles.grid2}>
        {filtered.length === 0 ? (
          <div className={styles.emptyState}>No tools match.</div>
        ) : (
          filtered.map(tool => (
            <div key={tool.id} className={styles.card}>
              <div className={styles.cardTop}>
                <span className={styles.cardName}>{tool.name}</span>
                {tool.github_url && isBrowsableUrl(tool.github_url) && (
                  <a
                    href={tool.github_url}
                    className={styles.cardGhLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`GitHub — ${tool.name}`}
                  >
                    ↗
                  </a>
                )}
              </div>
              <p className={styles.cardTagline}>
                {tool.tagline ?? '—'}
              </p>
              <div className={styles.cardFooter}>
                <div className={styles.cardStars}>
                  <span className={styles.starIcon}>★</span>
                  {fmtStars(tool.stars)}
                </div>
                <div className={styles.cardTags}>
                  {(tool.stack_tags ?? []).slice(0, 2).map(tag => (
                    <span key={tag} className={styles.cardTag}>{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  )
}
