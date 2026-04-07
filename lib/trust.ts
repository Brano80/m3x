/**
 * Trust score calculator — M3X AMN
 *
 * trust_score (0–100) =
 *   profile_completeness  (0–25)  — handle, display_name, markets, capabilities, webhook
 *   activity_score        (0–25)  — recent intents, last_active_at, match runs
 *   response_rate         (0–25)  — % of received handshakes responded to (accept OR decline)
 *   verification_flag     (0–25)  — email verified + domain/webhook present
 *
 * Called after every handshake accept or decline to keep scores live.
 */

import { SupabaseClient } from '@supabase/supabase-js'

// ---------- Component calculators ----------

function profileCompleteness(agent: Record<string, any>): number {
  let score = 0
  if (agent.handle)                                    score += 5
  if (agent.display_name)                              score += 5
  if (Array.isArray(agent.markets)    && agent.markets.length > 0)      score += 5
  if (Array.isArray(agent.capabilities) && agent.capabilities.length > 0) score += 5
  if (agent.webhook_url)                               score += 5
  return score  // max 25
}

function activityScore(agent: Record<string, any>, intentCount: number): number {
  let score = 0

  // Has at least one intent
  if (intentCount > 0) score += 8

  // Recent activity (last_active_at within 14 days)
  if (agent.last_active_at) {
    const daysSince = (Date.now() - new Date(agent.last_active_at).getTime()) / 86_400_000
    if (daysSince <= 7)  score += 10
    else if (daysSince <= 14) score += 5
  }

  // Has triggered match runs
  if ((agent.daily_match_runs ?? 0) > 0) score += 7

  return Math.min(25, score)  // max 25
}

function responseRateScore(responded: number, received: number): { rateScore: number; rate: number } {
  if (received === 0) {
    // New agent — neutral, not penalised
    return { rateScore: 12, rate: 0 }
  }
  const rate = Math.min(1, responded / received)
  return { rateScore: Math.round(rate * 25), rate }
}

function verificationScore(agent: Record<string, any>): number {
  let score = 0
  // Webhook URL present = domain-level reachability confirmed
  if (agent.webhook_url) score += 15
  // Active account
  if (agent.is_active)   score += 10
  return Math.min(25, score)  // max 25
}

// ---------- Main recalculate function ----------

export async function recalculateTrust(
  agentId: string,
  supabase: SupabaseClient,
  triggerEvent?: 'handshake_accepted' | 'handshake_declined' | 'handshake_received'
): Promise<{ trust_score: number; response_rate: number }> {

  // 1. Fetch agent
  const { data: agent } = await supabase
    .from('agents')
    .select('*')
    .eq('id', agentId)
    .single()

  if (!agent) return { trust_score: 25, response_rate: 0 }

  // 2. Count active intents
  const { count: intentCount } = await supabase
    .from('intents')
    .select('*', { count: 'exact', head: true })
    .eq('agent_id', agentId)

  // 3. Handshake response rate
  // "received" = handshakes where this agent was NOT the initiator
  const { count: received } = await supabase
    .from('handshakes')
    .select('*', { count: 'exact', head: true })
    .or(`agent_a_id.eq.${agentId},agent_b_id.eq.${agentId}`)
    .neq('initiated_by', agentId)

  // "responded" = received handshakes that are active OR declined (they replied either way)
  const { count: responded } = await supabase
    .from('handshakes')
    .select('*', { count: 'exact', head: true })
    .or(`agent_a_id.eq.${agentId},agent_b_id.eq.${agentId}`)
    .neq('initiated_by', agentId)
    .in('state', ['active', 'declined'])

  // 4. Compute components
  const pc  = profileCompleteness(agent)
  const act = activityScore(agent, intentCount ?? 0)
  const { rateScore, rate } = responseRateScore(responded ?? 0, received ?? 0)
  const ver = verificationScore(agent)

  const newScore = Math.min(100, pc + act + rateScore + ver)
  const newRate  = Number(rate.toFixed(4))

  // 5. Log trust event if triggered by a specific action
  if (triggerEvent) {
    const deltaMap: Record<string, number> = {
      handshake_accepted:  2,
      handshake_declined:  1,
      handshake_received:  0,
    }
    await supabase.from('trust_events').insert({
      agent_id:   agentId,
      event_type: triggerEvent,
      delta:      deltaMap[triggerEvent] ?? 0,
    })
  }

  // 6. Persist updated score + response_rate
  await supabase
    .from('agents')
    .update({
      trust_score:   newScore,
      response_rate: newRate,
      last_active_at: new Date().toISOString(),
    })
    .eq('id', agentId)

  return { trust_score: newScore, response_rate: newRate }
}
