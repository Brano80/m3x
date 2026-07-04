import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

// ── Rate limiting ────────────────────────────────────────────────────────────
const RL = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(req: NextRequest): boolean {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const now = Date.now()
  const entry = RL.get(ip)
  if (!entry || now > entry.resetAt) {
    RL.set(ip, { count: 1, resetAt: now + 60_000 })
    return false
  }
  if (entry.count >= 10) return true
  entry.count++
  return false
}

// ── Fetch helpers ────────────────────────────────────────────────────────────
async function fetchTimeout(url: string, init: RequestInit = {}, ms = 6000): Promise<Response | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, redirect: 'follow' })
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

interface Hit {
  ok: boolean
  status: number
  body: string
  headers: Record<string, string>
}

async function probe(url: string, init: RequestInit = {}): Promise<Hit | null> {
  const res = await fetchTimeout(url, init)
  if (!res) return null
  try {
    const body = await res.text()
    const headers: Record<string, string> = {}
    res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v })
    return { ok: res.ok, status: res.status, body, headers }
  } catch {
    return null
  }
}

// ── Meta extraction ──────────────────────────────────────────────────────────
function extractMeta(html: string): { title: string; description: string } {
  const title =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{1,120})["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']{1,120})["'][^>]+property=["']og:title["']/i)?.[1] ??
    html.match(/<title[^>]*>([^<]{1,120})<\/title>/i)?.[1] ??
    ''
  const description =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,300})["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']{1,300})["'][^>]+name=["']description["']/i)?.[1] ??
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{1,300})["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']{1,300})["'][^>]+property=["']og:description["']/i)?.[1] ??
    ''
  // Decode common HTML entities from meta tag values
  const decode = (s: string) => s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
  return { title: decode(title.trim()), description: decode(description.trim()) }
}

// ── URL normalisation + basic SSRF guard ────────────────────────────────────
function normaliseUrl(raw: string): string | null {
  let s = raw.trim()
  if (!s.startsWith('http://') && !s.startsWith('https://')) s = 'https://' + s
  try {
    const u = new URL(s)
    const h = u.hostname.toLowerCase()
    // Block obvious private ranges / loopback
    if (
      h === 'localhost' ||
      h === '0.0.0.0' ||
      h.endsWith('.local') ||
      /^127\./.test(h) ||
      /^10\./.test(h) ||
      /^192\.168\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
      /^169\.254\./.test(h) ||
      h === '::1'
    ) return null
    return `https://${u.hostname}`
  } catch {
    return null
  }
}

// ── Check definitions ────────────────────────────────────────────────────────
export interface Check {
  id: string
  name: string
  desc: string
  passed: boolean
  points: number
  maxPoints: number
  hint: string
}

export interface Category {
  id: string
  name: string
  checks: Check[]
  score: number
  maxScore: number
}

// ── Claude prompt generation ─────────────────────────────────────────────────
function generatePrompt(
  domain: string,
  companyName: string,
  description: string,
  failed: Check[],
): string {
  const baseUrl = `https://${domain}`
  const slug = domain.replace(/\./g, '-')

  const parts: string[] = []

  if (failed.find(f => f.id === 'agentsMd')) {
    parts.push(`FILE: /public/agents.md
---
# ${companyName}

## What I am
${description || `Website at ${baseUrl}`}

## Entry points for agents
- Website: ${baseUrl}
- MCP endpoint: (add your MCP server URL here)

## What I can do
- (describe your main capabilities for AI agents)

## Constraints
- Rate limit: (specify your limits)

## Register / contact
${baseUrl}/contact
---`)
  }

  if (failed.find(f => f.id === 'llmsTxt')) {
    parts.push(`FILE: /public/llms.txt
---
# ${companyName}

> ${description || `Website at ${baseUrl}`}

## What we do
${description || `We are ${companyName}, available at ${baseUrl}.`}

## Website
${baseUrl}

## Agent Integration
Discoverable via the M3X Agentic Matchmaking Network.
Network: https://m3x.space
Handle: pending — activate at https://m3x.space/aeo
---`)
  }

  if (failed.find(f => f.id === 'agentPerms')) {
    parts.push(`FILE: /public/.well-known/agent-permissions.json
---
{
  "version": "1.0",
  "description": "${companyName} — agent access policy",
  "permissions": {
    "read": { "allowed": true, "paths": ["/", "/llms.txt", "/agents.md", "/.well-known/"], "rateLimit": "1000/hour" },
    "write": { "allowed": false }
  },
  "preferredEntryPoints": {
    "website": "${baseUrl}",
    "openapi": "${baseUrl}/api/openapi.json"
  }
}
---`)
  }

  if (failed.find(f => f.id === 'ucp')) {
    parts.push(`FILE: /public/.well-known/ucp
---
{
  "version": "2026-04-08",
  "provider": {
    "name": "${companyName}",
    "url": "${baseUrl}",
    "description": "${description || companyName}"
  },
  "transports": [
    {
      "type": "rest",
      "protocol": "http",
      "endpoint": "${baseUrl}/api"
    }
  ],
  "services": []
}
---`)
  }

  if (failed.find(f => f.id === 'mcpJson')) {
    parts.push(`FILE: /public/.well-known/mcp.json
---
{
  "mcpServers": {
    "${slug}": {
      "url": "https://m3x.space/api/mcp?token=REPLACE_WITH_M3X_TOKEN",
      "description": "${companyName} agent endpoint via M3X network"
    }
  }
}
---`)
  }

  if (failed.find(f => f.id === 'agentJson')) {
    parts.push(`FILE: /public/.well-known/agent.json
---
{
  "name": "${companyName}",
  "url": "${baseUrl}",
  "description": "${description || companyName}",
  "capabilities": [],
  "contact": "${baseUrl}/contact",
  "mcp_endpoint": "https://m3x.space/api/mcp?token=REPLACE_WITH_M3X_TOKEN",
  "networks": ["https://m3x.space"]
}
---`)
  }

  if (failed.find(f => f.id === 'aiCatalogJson')) {
    parts.push(`FILE: /public/.well-known/ai-catalog.json
---
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "${companyName}",
  "url": "${baseUrl}",
  "description": "${description || companyName}",
  "agentEndpoint": "https://m3x.space/api/mcp?token=REPLACE_WITH_M3X_TOKEN"
}
---`)
  }

  const robotsLines: string[] = []
  if (failed.find(f => f.id === 'contentSignals')) {
    robotsLines.push('# Content Signals (https://blog.cloudflare.com/content-signals/)\nContent-Signals: canonical')
  }
  if (failed.find(f => f.id === 'aiBotRules')) {
    robotsLines.push(`User-agent: GPTBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n\nUser-agent: anthropic-ai\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /`)
  }
  if (robotsLines.length) {
    parts.push(`EDIT: robots.txt — append the following lines\n---\n${robotsLines.join('\n\n')}\n---`)
  }

  if (failed.find(f => f.id === 'jsonLd')) {
    parts.push(`EDIT: HTML layout — add to <head>\n---\n<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "Organization",\n  "name": "${companyName}",\n  "url": "${baseUrl}",\n  "description": "${description || companyName}"\n}\n</script>\n---`)
  }

  if (failed.find(f => f.id === 'linkHeaders')) {
    parts.push(`EDIT: HTTP response headers — add Link header to homepage\n---\nLink: <${baseUrl}/api>; rel="service-desc", <${baseUrl}/.well-known/api-catalog>; rel="api-catalog"\n(Add this via your server config, Next.js headers(), or middleware)\n---`)
  }

  const failedNames = failed.map(f => f.name).join(', ')

  return `<task>
Make ${baseUrl} agent-ready.
Add the files and edits below. This makes the site discoverable by AI agents browsing the open web.
</task>

<context>
  Domain: ${domain}
  Company: ${companyName}
  Description: ${description || `Website at ${baseUrl}`}
  Missing checks: ${failedNames}
</context>

<instructions>
${parts.join('\n\n')}

After completing the above, replace REPLACE_WITH_M3X_TOKEN with your actual token from https://m3x.space/register
</instructions>`
}

// ── Main handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (isRateLimited(req)) {
    return NextResponse.json(
      { error: { message: 'Too many scans. Try again in a minute.', code: 'RATE_LIMITED' } },
      { status: 429 },
    )
  }

  let body: { url?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: { message: 'Invalid JSON', code: 'BAD_REQUEST' } }, { status: 400 })
  }

  const baseUrl = normaliseUrl(body.url ?? '')
  if (!baseUrl) {
    return NextResponse.json(
      { error: { message: 'Enter a valid public domain (e.g. example.com)', code: 'INVALID_URL' } },
      { status: 400 },
    )
  }

  // Parallel fetch — all endpoints at once
  const [
    homepage,
    homepageMd,
    robotsTxt,
    llmsTxt,
    agentsMd,
    mcpJson,
    agentJson,
    aiCatalog,
    apiCatalog,
    agentSkills,
    agentPerms,
    oauthPr,
    a2aCard,
    didJson,
    mcpServerCard,
    webBotAuth,
    ucp,
  ] = await Promise.all([
    probe(baseUrl),
    probe(baseUrl, { headers: { Accept: 'text/markdown,text/plain;q=0.9,*/*;q=0.1' } }),
    probe(`${baseUrl}/robots.txt`),
    probe(`${baseUrl}/llms.txt`),
    probe(`${baseUrl}/agents.md`),
    probe(`${baseUrl}/.well-known/mcp.json`),
    probe(`${baseUrl}/.well-known/agent.json`),
    probe(`${baseUrl}/.well-known/ai-catalog.json`),
    probe(`${baseUrl}/.well-known/api-catalog`),
    probe(`${baseUrl}/.well-known/agent-skills/index.json`),
    probe(`${baseUrl}/.well-known/agent-permissions.json`),
    probe(`${baseUrl}/.well-known/oauth-protected-resource`),
    probe(`${baseUrl}/.well-known/agent-card.json`),
    probe(`${baseUrl}/.well-known/did.json`),
    probe(`${baseUrl}/.well-known/mcp/server-card.json`),
    probe(`${baseUrl}/.well-known/web-bot-auth`),
    probe(`${baseUrl}/.well-known/ucp`),
  ])

  const meta = homepage ? extractMeta(homepage.body) : { title: '', description: '' }
  const domain = new URL(baseUrl).hostname

  // ── Evaluate each check ────────────────────────────────────────────────────
  const pass = {
    robots:              robotsTxt?.ok === true,
    llmsTxt:             llmsTxt?.ok === true,
    agentsMd:            agentsMd?.ok === true,
    sitemap:             !!(robotsTxt?.body?.includes('Sitemap:')),
    linkHeaders:         !!(homepage?.headers?.['link']),
    markdownNegotiation: !!(homepageMd?.headers?.['content-type']?.includes('markdown')),
    jsonLd:              !!(homepage?.body?.includes('application/ld+json')),
    contentSignals:      !!(robotsTxt?.body && (
                           robotsTxt.body.includes('Content-Signals') ||
                           robotsTxt.body.includes('content-signals')
                         )),
    aiBotRules:          !!(robotsTxt?.body && (
                           robotsTxt.body.includes('GPTBot') ||
                           robotsTxt.body.includes('ClaudeBot') ||
                           robotsTxt.body.includes('anthropic-ai') ||
                           robotsTxt.body.includes('PerplexityBot')
                         )),
    webBotAuth:          !!(webBotAuth?.ok || homepage?.headers?.['www-authenticate']?.toLowerCase().includes('botauth')),
    mcpJson:             !!(mcpJson?.ok && mcpJson.body?.length > 10),
    agentJson:           agentJson?.ok === true,
    aiCatalogJson:       aiCatalog?.ok === true,
    apiCatalog:          apiCatalog?.ok === true,
    agentSkills:         agentSkills?.ok === true,
    agentPerms:          agentPerms?.ok === true,
    ucp:                 !!(ucp?.ok && ucp.body?.length > 10),
    a2aCard:             !!(a2aCard?.ok || (agentJson?.ok && agentJson.body?.includes('capabilities'))),
    oauthPr:             oauthPr?.ok === true,
    didJson:             didJson?.ok === true,
    x402:                !!(homepage?.headers?.['x-payment'] || homepage?.headers?.['accept-payment'] || homepage?.status === 402),
    mcpServerCard:       mcpServerCard?.ok === true,
  }

  // ── Build category results ─────────────────────────────────────────────────
  const categories: Category[] = [
    {
      id: 'discoverability',
      name: 'Discoverability',
      checks: [
        { id: 'robots',       name: 'robots.txt',     desc: 'Valid robots.txt at domain root',          passed: pass.robots,       points: pass.robots       ? 5  : 0, maxPoints: 5,  hint: 'Add a robots.txt file at the root of your domain.' },
        { id: 'llmsTxt',      name: 'llms.txt',       desc: 'AI-readable site overview',                passed: pass.llmsTxt,      points: pass.llmsTxt      ? 8  : 0, maxPoints: 8,  hint: 'Add /llms.txt — a plain-text summary of your site for AI agents. See llmstxt.org.' },
        { id: 'agentsMd',     name: 'agents.md',      desc: 'Agent-optimised entry point at /agents.md', passed: pass.agentsMd,     points: pass.agentsMd     ? 3  : 0, maxPoints: 3,  hint: 'Add /agents.md — a Markdown file describing what your site can do for AI agents, entry points, and constraints.' },
        { id: 'sitemap',      name: 'Sitemap',        desc: 'Sitemap declared in robots.txt',           passed: pass.sitemap,      points: pass.sitemap      ? 4  : 0, maxPoints: 4,  hint: 'Add Sitemap: https://yourdomain.com/sitemap.xml to robots.txt.' },
        { id: 'linkHeaders',  name: 'Link Headers',   desc: 'RFC 8288 Link headers on homepage',        passed: pass.linkHeaders,  points: pass.linkHeaders  ? 3  : 0, maxPoints: 3,  hint: 'Serve Link: </api>; rel="service-desc" HTTP response headers on your homepage.' },
      ],
      score: 0, maxScore: 0,
    },
    {
      id: 'content',
      name: 'Content Signals',
      checks: [
        { id: 'markdownNegotiation', name: 'Markdown Negotiation', desc: 'Serves Markdown on Accept: text/markdown',    passed: pass.markdownNegotiation, points: pass.markdownNegotiation ? 6 : 0, maxPoints: 6, hint: 'Detect Accept: text/markdown and respond with a Markdown version of the page.' },
        { id: 'jsonLd',              name: 'JSON-LD',               desc: 'Structured data in HTML head',                passed: pass.jsonLd,              points: pass.jsonLd              ? 5 : 0, maxPoints: 5, hint: 'Add <script type="application/ld+json"> with Organization schema to your HTML <head>.' },
        { id: 'contentSignals',      name: 'Content Signals',       desc: 'Content-Signals directive in robots.txt',     passed: pass.contentSignals,      points: pass.contentSignals      ? 4 : 0, maxPoints: 4, hint: 'Add Content-Signals: canonical to robots.txt. See blog.cloudflare.com/content-signals.' },
        { id: 'aiBotRules',          name: 'AI Bot Rules',          desc: 'AI crawlers addressed in robots.txt',         passed: pass.aiBotRules,          points: pass.aiBotRules          ? 3 : 0, maxPoints: 3, hint: 'Add explicit Allow/Disallow rules for GPTBot, ClaudeBot, and PerplexityBot.' },
      ],
      score: 0, maxScore: 0,
    },
    {
      id: 'protocols',
      name: 'Agent Protocols',
      checks: [
        { id: 'mcpJson',       name: 'MCP Endpoint',   desc: '/.well-known/mcp.json',                  passed: pass.mcpJson,       points: pass.mcpJson       ? 10 : 0, maxPoints: 10, hint: 'Add /.well-known/mcp.json pointing to your MCP server URL.' },
        { id: 'agentJson',     name: 'Agent Card',     desc: '/.well-known/agent.json',                passed: pass.agentJson,     points: pass.agentJson     ? 7  : 0, maxPoints: 7,  hint: 'Add /.well-known/agent.json — a machine-readable profile of your agent.' },
        { id: 'aiCatalogJson', name: 'AI Catalog',     desc: '/.well-known/ai-catalog.json',           passed: pass.aiCatalogJson, points: pass.aiCatalogJson ? 5  : 0, maxPoints: 5,  hint: 'Add /.well-known/ai-catalog.json with capabilities and contact info.' },
        { id: 'apiCatalog',    name: 'API Catalog',    desc: '/.well-known/api-catalog (RFC 9727)',    passed: pass.apiCatalog,    points: pass.apiCatalog    ? 4  : 0, maxPoints: 4,  hint: 'Publish an API catalog at /.well-known/api-catalog per RFC 9727.' },
        { id: 'agentSkills',   name: 'Agent Skills',   desc: '/.well-known/agent-skills/index.json',   passed: pass.agentSkills,   points: pass.agentSkills   ? 4  : 0, maxPoints: 4,  hint: 'Declare agent capabilities at /.well-known/agent-skills/index.json.' },
        { id: 'ucp',           name: 'UCP',            desc: 'Universal Commerce Protocol at /.well-known/ucp', passed: pass.ucp,      points: pass.ucp           ? 3  : 0, maxPoints: 3,  hint: 'Publish /.well-known/ucp declaring your agentic transports and services. See ucp.dev.' },
      ],
      score: 0, maxScore: 0,
    },
    {
      id: 'identity',
      name: 'Identity & Auth',
      checks: [
        { id: 'a2aCard',  name: 'A2A Agent Card',    desc: 'Google A2A protocol card',              passed: pass.a2aCard,  points: pass.a2aCard  ? 5 : 0, maxPoints: 5, hint: 'Add /.well-known/agent-card.json compatible with Google A2A protocol.' },
        { id: 'oauthPr',  name: 'OAuth Resource',    desc: 'RFC 9728 OAuth Protected Resource',     passed: pass.oauthPr,  points: pass.oauthPr  ? 4 : 0, maxPoints: 4, hint: 'Add /.well-known/oauth-protected-resource per RFC 9728.' },
        { id: 'didJson',  name: 'DID Document',      desc: 'W3C Decentralized Identity document',   passed: pass.didJson,  points: pass.didJson  ? 3 : 0, maxPoints: 3, hint: 'Publish a W3C DID document at /.well-known/did.json.' },
        { id: 'webBotAuth', name: 'Web Bot Auth',    desc: 'Authenticated AI crawler access',       passed: pass.webBotAuth, points: pass.webBotAuth ? 3 : 0, maxPoints: 3, hint: 'Implement Web Bot Auth at /.well-known/web-bot-auth.' },
        { id: 'agentPerms', name: 'Agent Permissions', desc: '/.well-known/agent-permissions.json', passed: pass.agentPerms, points: pass.agentPerms ? 3 : 0, maxPoints: 3, hint: 'Publish /.well-known/agent-permissions.json declaring read/write access rules for AI agents.' },
      ],
      score: 0, maxScore: 0,
    },
    {
      id: 'commerce',
      name: 'Commerce',
      checks: [
        { id: 'x402',        name: 'x402 Payments',  desc: 'Agent-to-agent payment protocol',  passed: pass.x402,        points: pass.x402        ? 5 : 0, maxPoints: 5, hint: 'Implement x402 to accept agent-initiated micropayments. See x402.org.' },
        { id: 'mcpServerCard', name: 'MCP Server Card', desc: '/.well-known/mcp/server-card.json', passed: pass.mcpServerCard, points: pass.mcpServerCard ? 3 : 0, maxPoints: 3, hint: 'Publish MCP server capabilities at /.well-known/mcp/server-card.json.' },
      ],
      score: 0, maxScore: 0,
    },
  ]

  // Calculate scores
  for (const cat of categories) {
    cat.score    = cat.checks.reduce((s, c) => s + c.points, 0)
    cat.maxScore = cat.checks.reduce((s, c) => s + c.maxPoints, 0)
  }

  const score    = categories.reduce((s, c) => s + c.score, 0)
  const maxScore = categories.reduce((s, c) => s + c.maxScore, 0)

  const failedChecks = categories.flatMap(c => c.checks.filter(ch => !ch.passed))
  const prompt = generatePrompt(domain, meta.title || domain, meta.description, failedChecks)

  // Ship-2 intake: does this domain already have a library card? + persist the scan.
  // Both are best-effort — a DB hiccup must never break the free scan.
  let library: { urn: string; name: string; status: string; trust_score: number } | null = null
  try {
    const supabase = getServiceClient()
    const { data: match } = await supabase.rpc('library_find_by_domain', { p_domain: domain })
    if (Array.isArray(match) && match[0]) {
      library = { urn: match[0].urn, name: match[0].name, status: match[0].status, trust_score: match[0].trust_score }
    }
    await supabase.rpc('library_log_scan', {
      p_domain: domain,
      p_score:  score,
      p_max:    maxScore,
      p_failed: failedChecks.map(ch => ch.id),
      p_title:  meta.title || null,
      p_urn:    library?.urn ?? null,
    })
  } catch { /* never fail the scan on logging */ }

  return NextResponse.json({
    url:        baseUrl,
    domain,
    meta,
    score,
    maxScore,
    categories,
    prompt,
    library,
    scannedAt:  new Date().toISOString(),
  })
}
