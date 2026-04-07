import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { fetchTableCount } from '@/lib/stats-count'

/** Must be dynamic — static caching was serving stale counts at build time */
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' } as const

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || (!serviceKey && !anonKey)) {
    return NextResponse.json({ agents: null, matches: null }, { headers: NO_STORE })
  }

  try {
    // Primary path: service role + direct PostgREST HEAD (reliable Content-Range count)
    if (serviceKey) {
      const [agents, matches] = await Promise.all([
        fetchTableCount(url, serviceKey, 'agents'),
        fetchTableCount(url, serviceKey, 'matches'),
      ])

      if (agents.error) console.error('[stats] agents:', agents.error)
      if (matches.error) console.error('[stats] matches:', matches.error)

      if (agents.count === null || matches.count === null) {
        // Fallback: supabase-js (older behaviour)
        const supabase = getServiceClient()
        const [aRes, mRes] = await Promise.all([
          supabase.from('agents').select('id', { count: 'exact', head: true }),
          supabase.from('matches').select('id', { count: 'exact', head: true }),
        ])
        if (aRes.error || mRes.error) {
          console.error('[stats] fallback', aRes.error?.message, mRes.error?.message)
          return NextResponse.json(
            { agents: null, matches: null },
            { headers: NO_STORE }
          )
        }
        return NextResponse.json(
          {
            agents: aRes.count ?? agents.count ?? 0,
            matches: mRes.count ?? matches.count ?? 0,
          },
          { headers: NO_STORE }
        )
      }

      return NextResponse.json(
        { agents: agents.count, matches: matches.count },
        { headers: NO_STORE }
      )
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
