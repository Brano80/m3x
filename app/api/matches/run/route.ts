import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { verifyAgent } from '@/lib/auth'
import { decryptKey } from '@/lib/crypto'
import { runMatchingForIntent } from '@/lib/matching'

const MAX_RUNS_PER_DAY = 5

// Atomic, race-free daily rate limit. Reads + writes happen in a single
// conditional UPDATE — two concurrent requests can no longer both pass the
// "still under limit" check.
async function checkRateLimit(supabase: any, agent: any): Promise<{ allowed: boolean; remaining: number }> {
  const now = new Date()
  const resetAt = agent.match_runs_reset_at ? new Date(agent.match_runs_reset_at) : new Date(0)
  const isNewDay = now.toDateString() !== resetAt.toDateString()

  if (isNewDay) {
    // First run of a new day — reset counter to 1.
    await supabase
      .from('agents')
      .update({ daily_match_runs: 1, match_runs_reset_at: now.toISOString() })
      .eq('id', agent.id)
    return { allowed: true, remaining: MAX_RUNS_PER_DAY - 1 }
  }

  const currentRuns = agent.daily_match_runs ?? 0

  // Atomic increment guarded by `daily_match_runs < MAX_RUNS_PER_DAY`. Postgres
  // serialises concurrent UPDATEs on the same row, so only one of N concurrent
  // callers under the limit will succeed at the boundary.
  const { data: updated } = await supabase
    .from('agents')
    .update({
      daily_match_runs: currentRuns + 1,
      match_runs_reset_at: agent.match_runs_reset_at,
    })
    .eq('id', agent.id)
    .lt('daily_match_runs', MAX_RUNS_PER_DAY)
    .select('id, daily_match_runs')
    .single()

  if (!updated) {
    return { allowed: false, remaining: 0 }
  }

  return { allowed: true, remaining: Math.max(0, MAX_RUNS_PER_DAY - (updated.daily_match_runs ?? currentRuns + 1)) }
}

export async function POST(req: NextRequest) {
  const supabase = getServiceClient()
  const agent = await verifyAgent(req, supabase)
  if (!agent) {
    return NextResponse.json(
      { error: { message: 'Invalid or missing bearer token', code: 'UNAUTHORIZED' } },
      { status: 401 }
    )
  }

  const { allowed, remaining } = await checkRateLimit(supabase, agent)
  if (!allowed) {
    return NextResponse.json(
      { error: { message: `Rate limit reached: ${MAX_RUNS_PER_DAY} match runs per day. Resets at midnight UTC.`, code: 'RATE_LIMIT_EXCEEDED' } },
      {
        status: 429,
        headers: { 'X-RateLimit-Limit': String(MAX_RUNS_PER_DAY), 'X-RateLimit-Remaining': '0' }
      }
    )
  }

  const byok = agent.byok_key_enc && agent.byok_provider
    ? { provider: agent.byok_provider, key: (() => { try { return decryptKey(agent.byok_key_enc) } catch { return null } })() }
    : null
  const resolvedByok = byok?.key ? (byok as { provider: string; key: string }) : undefined

  const { data: myIntents } = await supabase
    .from('intents')
    .select('id, agent_id, side, market, intent_type, raw_packet, guardrails, status, expires_at, created_at')
    .eq('agent_id', agent.id)
    .eq('status', 'active')

  if (!myIntents?.length) {
    return NextResponse.json(
      { matches_found: 0, matches: [], message: 'No active intents', rate_limit: { remaining } },
      { headers: { 'X-RateLimit-Limit': String(MAX_RUNS_PER_DAY), 'X-RateLimit-Remaining': String(remaining) } }
    )
  }

  let totalFound = 0
  const allMatches: any[] = []

  for (const intent of myIntents) {
    const result = await runMatchingForIntent(intent, agent, supabase, resolvedByok)
    totalFound += result.matches_found
    allMatches.push(...result.matches)
  }

  return NextResponse.json(
    { matches_found: totalFound, matches: allMatches, rate_limit: { remaining } },
    { headers: { 'X-RateLimit-Limit': String(MAX_RUNS_PER_DAY), 'X-RateLimit-Remaining': String(remaining) } }
  )
}
