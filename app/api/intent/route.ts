import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { getServiceClient } from '@/lib/supabase'
import { verifyAgent } from '@/lib/auth'
import { extractIntentSignals } from '@/lib/extract'
import { embedText } from '@/lib/embed'
import { decryptKey } from '@/lib/crypto'
import { runMatchingForIntent } from '@/lib/matching'
import { geminiStructured } from '@/lib/gemini'
import { recomputeAgentCard } from '@/lib/enrich-agent-card'

const VALID_MARKETS = [
  'venture_capital', 'ma_deal_flow', 'real_estate', 'private_equity',
  'b2b_saas', 'legal_services', 'procurement', 'healthcare',
  'freelance', 'cofounder', 'hiring', 'partnerships',
]

// Hard caps on user-supplied intent text. Without these, an attacker can post
// large bodies that fan out into paid HuggingFace embedding + Gemini extract +
// Gemini classify calls, amplifying cost and storage per request.
const MAX_INTENT_TEXT_LEN = 4000
const MAX_TTL_HOURS = 2160 // 90 days, matches OpenAPI spec
const MIN_TTL_HOURS = 1

async function classifyMarket(offersText: string, seekingText: string): Promise<string> {
  try {
    const prompt = `Given this intent, classify it into exactly one of these markets:
venture_capital, ma_deal_flow, real_estate, private_equity, b2b_saas, legal_services, procurement, healthcare, freelance, cofounder, hiring, partnerships

Intent:
Offering: ${offersText}
Seeking: ${seekingText}

Reply with ONLY the market ID, nothing else.`
    const result = await geminiStructured(prompt, process.env.GEMINI_API_KEY!, 32)
    const classified = result.trim().toLowerCase()
    return VALID_MARKETS.includes(classified) ? classified : 'b2b_saas'
  } catch (e) {
    console.error('[intent] market classification failed:', e)
    return 'b2b_saas'
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getServiceClient()

    const agent = await verifyAgent(req, supabase)
    if (!agent) {
      return NextResponse.json(
        { error: { message: 'Invalid or missing bearer token', code: 'UNAUTHORIZED' } },
        { status: 401 }
      )
    }

    const body = await req.json()
    const { side, market: marketRaw, offers, seeking, guardrails = {}, ttl_hours = 720 } = body  // default 30 days

    if (!side || !['demand', 'supply'].includes(side)) {
      return NextResponse.json(
        { error: { message: 'side must be "demand" or "supply"', code: 'INVALID_SIDE' } },
        { status: 400 }
      )
    }
    if (!offers || !seeking) {
      return NextResponse.json(
        { error: { message: 'offers and seeking are required in the request body', code: 'MISSING_INTENT' } },
        { status: 400 }
      )
    }

    // ttl_hours bounds — prevents intents from living for years and gaming
    // the per-agent active-intent counter
    if (typeof ttl_hours !== 'number' || !Number.isFinite(ttl_hours) ||
        ttl_hours < MIN_TTL_HOURS || ttl_hours > MAX_TTL_HOURS) {
      return NextResponse.json(
        { error: { message: `ttl_hours must be between ${MIN_TTL_HOURS} and ${MAX_TTL_HOURS}`, code: 'INVALID_TTL' } },
        { status: 400 }
      )
    }

    // Length bounds on offers/seeking — they flow into paid HuggingFace
    // embedding + Gemini extract + Gemini classify calls.
    const offersTextRaw = typeof offers === 'string' ? offers : (offers?.description ?? JSON.stringify(offers))
    const seekingTextRaw = typeof seeking === 'string' ? seeking : (seeking?.description ?? JSON.stringify(seeking))
    if (typeof offersTextRaw !== 'string' || typeof seekingTextRaw !== 'string' ||
        offersTextRaw.length > MAX_INTENT_TEXT_LEN || seekingTextRaw.length > MAX_INTENT_TEXT_LEN) {
      return NextResponse.json(
        { error: { message: `offers and seeking text must be strings under ${MAX_INTENT_TEXT_LEN} chars each`, code: 'INTENT_TOO_LONG' } },
        { status: 400 }
      )
    }

    // ---------- Rate limiting ----------
    const ACTIVE_INTENT_LIMIT = 5   // max concurrent active intents per agent
    const DAILY_POST_LIMIT    = 10  // max intent posts per 24h per agent

    const [{ count: activeCount }, { count: dailyCount }] = await Promise.all([
      supabase
        .from('intents')
        .select('*', { count: 'exact', head: true })
        .eq('agent_id', agent.id)
        .eq('status', 'active'),
      supabase
        .from('intents')
        .select('*', { count: 'exact', head: true })
        .eq('agent_id', agent.id)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    ])

    if ((activeCount ?? 0) >= ACTIVE_INTENT_LIMIT) {
      return NextResponse.json(
        {
          error: {
            message: `You have ${activeCount} active intents. Maximum is ${ACTIVE_INTENT_LIMIT}. Withdraw an intent before posting a new one.`,
            code: 'ACTIVE_INTENT_LIMIT_EXCEEDED',
          },
        },
        { status: 429 }
      )
    }

    if ((dailyCount ?? 0) >= DAILY_POST_LIMIT) {
      return NextResponse.json(
        {
          error: {
            message: `Daily intent limit reached (${DAILY_POST_LIMIT} posts per 24h). Try again later.`,
            code: 'DAILY_INTENT_LIMIT_EXCEEDED',
          },
        },
        { status: 429 }
      )
    }
    // -----------------------------------

    const offersText = offersTextRaw
    const seekingText = seekingTextRaw

    // Auto-classify market if not provided
    const market = (marketRaw && VALID_MARKETS.includes(marketRaw))
      ? marketRaw
      : await classifyMarket(offersText, seekingText)

    console.log(`[intent] market=${market} (${marketRaw ? 'provided' : 'auto-classified'})`)

    const raw_packet = { agent_id: agent.did, side, market, offers, seeking, guardrails }
    const expires_at = new Date(Date.now() + ttl_hours * 60 * 60 * 1000).toISOString()

    // Resolve BYOK key for extraction
    const byok = agent.byok_key_enc && agent.byok_provider
      ? (() => { try { return { provider: agent.byok_provider, key: decryptKey(agent.byok_key_enc) } } catch { return undefined } })()
      : undefined

    // Stage 1 — Extract signals (agent BYOK key if set, otherwise infra key)
    const signals = await extractIntentSignals(offersText, seekingText, market, byok)

    // Stage 2 — Embed (HuggingFace)
    const vector = await embedText(`${offersText} ${seekingText}`)

    // Stage 3 — Store
    const { data: intent, error } = await supabase
      .from('intents')
      .insert({
        agent_id: agent.id,
        side,
        market,
        intent_type: signals?.intent_type ?? null,
        raw_packet,
        embedding: vector ? `[${vector.join(',')}]` : null,
        guardrails,
        expires_at,
      })
      .select('id, side, market, intent_type, status, expires_at, created_at')
      .single()

    if (error) throw error

    await supabase
      .from('agents')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', agent.id)

    // Recompute agent card from currently-active intents (Option B: replace,
    // not union with stale state). Fire-and-forget — never affects this POST.
    waitUntil(recomputeAgentCard(agent.id, supabase))

    // Auto-trigger matching — kept alive by waitUntil so Vercel doesn't kill it
    waitUntil(
      runMatchingForIntent(intent, agent, supabase, byok).catch(
        e => console.error('[intent] auto-match error:', e)
      )
    )

    return NextResponse.json({
      intent,
      signals_extracted: !!signals,
      embedded: !!vector,
      message: 'Intent posted. Matching running in background.',
    }, { status: 201 })

  } catch (err: any) {
    console.error('[intent]', err)
    return NextResponse.json(
      { error: { message: err.message ?? 'Internal server error', code: 'SERVER_ERROR' } },
      { status: 500 }
    )
  }
}
