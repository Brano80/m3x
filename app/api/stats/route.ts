import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const revalidate = 60 // cache for 60 seconds

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    const [{ count: agents }, { count: matches }] = await Promise.all([
      supabase.from('agents').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('matches').select('*', { count: 'exact', head: true }),
    ])

    return NextResponse.json(
      { agents: agents ?? 0, matches: matches ?? 0 },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } }
    )
  } catch {
    return NextResponse.json({ agents: 0, matches: 0 })
  }
}
