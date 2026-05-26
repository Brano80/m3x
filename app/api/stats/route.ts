import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { fetchTableCount } from '@/lib/stats-count'

/** Must be dynamic — static caching was serving stale counts at build time */
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' } as const

export async function GET(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  const verbose = new URL(req.url).searchParams.get('verbose') === '1'

  if (!url || (!serviceKey && !anonKey)) {
    return NextResponse.json(
      verbose
        ? {
            agents: null,
            matches: null,
            reason: 'missing_env',
            hasUrl: !!url,
            hasServiceKey: !!serviceKey,
            hasAnonKey: !!anonKey,
            hint:
              'Set NEXT_PUBLIC_SUPABASE_URL (and SUPABASE_SERVICE_ROLE_KEY) on Vercel — same values as .env.local',
          }
        : { agents: null, matches: null },
      { headers: NO_STORE }
    )
  }

  try {
    // Primary path: service role + direct PostgREST GET + Content-Range count
    if (serviceKey) {
      const [agents, matches] = await Promise.all([
        fetchTableCount(url, serviceKey, 'agents'),
        fetchTableCount(url, serviceKey, 'matches'),
      ])

      if (agents.error) console.error('[stats] agents:', agents.error)
      if (matches.error) console.error('[stats] matches:', matches.error)

      // Fetch tool_radar count via supabase-js (separate schema, can't use fetchTableCount)
      let toolsCount: number | null = null
      try {
        const sb = getServiceClient()
        const { count } = await sb
          .schema('tool_radar')
          .from('tool_cards')
          .select('id', { count: 'exact', head: true })
        toolsCount = count ?? null
      } catch (e) {
        console.error('[stats] tool_radar count', e)
      }

      if (agents.count !== null && matches.count !== null) {
        return NextResponse.json(
          verbose
            ? { agents: agents.count, matches: matches.count, tools: toolsCount, source: 'rest' }
            : { agents: agents.count, matches: matches.count, tools: toolsCount },
          { headers: NO_STORE }
        )
      }

      if (agents.count === null || matches.count === null) {
        // Fallback: supabase-js (older behaviour)
        let supabase
        try {
          supabase = getServiceClient()
        } catch (e) {
          console.error('[stats] getServiceClient', e)
          return NextResponse.json({ agents: null, matches: null, tools: toolsCount }, { headers: NO_STORE })
        }
        const [aRes, mRes] = await Promise.all([
          supabase.from('agents').select('id', { count: 'exact', head: true }),
          supabase.from('matches').select('id', { count: 'exact', head: true }),
        ])
        if (aRes.error || mRes.error) {
          console.error('[stats] fallback', aRes.error?.message, mRes.error?.message)
          return NextResponse.json(
            verbose
              ? {
                  agents: null,
                  matches: null,
                  tools: toolsCount,
                  reason: 'fallback_supabase_error',
                  agentsRest: agents.error,
                  matchesRest: matches.error,
                  agentsSdk: aRes.error?.message,
                  matchesSdk: mRes.error?.message,
                }
              : { agents: null, matches: null, tools: toolsCount },
            { headers: NO_STORE }
          )
        }
        return NextResponse.json(
          verbose
            ? {
                agents: aRes.count ?? agents.count ?? 0,
                matches: mRes.count ?? matches.count ?? 0,
                tools: toolsCount,
                source: 'supabase-js',
              }
            : {
                agents: aRes.count ?? agents.count ?? 0,
                matches: mRes.count ?? matches.count ?? 0,
                tools: toolsCount,
              },
          { headers: NO_STORE }
        )
      }
    }

    // Anon only: RLS may block — try supabase-js
    const supabase = createClient(url, anonKey!, { auth: { persistSession: false } })
    const [agentsRes, matchesRes] = await Promise.all([
      supabase.from('agents').select('id', { count: 'exact', head: true }),
      supabase.from('matches').select('id', { count: 'exact', head: true }),
    ])

    if (agentsRes.error || matchesRes.error) {
      console.error('[stats] anon', agentsRes.error?.message, matchesRes.error?.message)
      return NextResponse.json({ agents: null, matches: null }, { headers: NO_STORE })
    }

    return NextResponse.json(
      {
        agents: agentsRes.count ?? 0,
        matches: matchesRes.count ?? 0,
      },
      { headers: NO_STORE }
    )
  } catch (e) {
    console.error('[stats]', e)
    return NextResponse.json({ agents: null, matches: null }, { headers: NO_STORE })
  }
}
