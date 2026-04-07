import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

/** Must be dynamic — static caching was serving 0 at build time */
export const dynamic = 'force-dynamic'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || (!serviceKey && !anonKey)) {
    return NextResponse.json(
      { agents: null, matches: null },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } }
    )
  }

  const supabase = serviceKey
    ? getServiceClient()
    : createClient(url, anonKey, { auth: { persistSession: false } })

  try {
    const [agentsRes, matchesRes] = await Promise.all([
      supabase.from('agents').select('*', { count: 'exact', head: true }),
      supabase.from('matches').select('*', { count: 'exact', head: true }),
    ])

    if (agentsRes.error || matchesRes.error) {
      console.error('[stats]', agentsRes.error?.message, matchesRes.error?.message)
      return NextResponse.json(
        { agents: null, matches: null },
        { status: 503, headers: { 'Cache-Control': 'private, no-store' } }
      )
    }

    return NextResponse.json(
      {
        agents: agentsRes.count ?? 0,
        matches: matchesRes.count ?? 0,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } }
    )
  } catch (e) {
    console.error('[stats]', e)
    return NextResponse.json(
      { agents: null, matches: null },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } }
    )
  }
}
