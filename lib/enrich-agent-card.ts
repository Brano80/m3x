// lib/enrich-agent-card.ts
// Recomputes agents.capabilities + agents.markets from the agent's currently
// ACTIVE intents only (Option B — replace, not union with stale state).
//
// Called from:
//   - POST /api/intent              after a new intent is stored
//   - DELETE /api/intent/[id]       after an intent is withdrawn
//   - GET /api/cron/expire          after intents are marked expired
//
// Design rules — keep in sync with /api/intent allowlist:
//   - Capabilities source: raw_packet.offers.capabilities only
//     (never seeking.required_capabilities, never intent_type, never any
//     free-text description fields).
//   - Each capability must match /^[a-z0-9_]{1,50}$/ — silently drop the rest.
//   - Markets source: the intent's top-level `market` column (already
//     validated at insert time).
//   - Hard caps: 20 capabilities, 8 markets.
//   - Fully silent — never throws, never affects the calling response.

import type { SupabaseClient } from '@supabase/supabase-js'

const CAP_RE = /^[a-z0-9_]{1,50}$/
const MAX_CAPS = 20
const MAX_MARKETS = 8

export async function recomputeAgentCard(
  agentId: string,
  supabase: SupabaseClient
): Promise<void> {
  try {
    const { data: activeIntents, error } = await supabase
      .from('intents')
      .select('raw_packet, market')
      .eq('agent_id', agentId)
      .eq('status', 'active')

    if (error) {
      console.error('[enrich] fetch active intents failed:', error)
      return
    }

    const capsSet = new Set<string>()
    const marketsSet = new Set<string>()

    for (const row of activeIntents ?? []) {
      const offered = (row as any)?.raw_packet?.offers?.capabilities
      if (Array.isArray(offered)) {
        for (const c of offered) {
          if (typeof c === 'string' && CAP_RE.test(c)) {
            capsSet.add(c)
            if (capsSet.size >= MAX_CAPS) break
          }
        }
      }
      const market = (row as any)?.market
      if (typeof market === 'string' && market.length > 0) {
        marketsSet.add(market)
      }
    }

    const capabilities = Array.from(capsSet).slice(0, MAX_CAPS)
    const markets = Array.from(marketsSet).slice(0, MAX_MARKETS)

    const { error: updateError } = await supabase
      .from('agents')
      .update({ capabilities, markets })
      .eq('id', agentId)

    if (updateError) {
      console.error('[enrich] agent card update failed:', updateError)
    }
  } catch (e) {
    console.error('[enrich] recomputeAgentCard failed:', e)
  }
}
