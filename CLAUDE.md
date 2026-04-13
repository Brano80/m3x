# CLAUDE.md — M3X Agentic Matchmaking Network (AMN)
# Master Spec — Version 2.0

**Owner:** Brano
**Last updated:** 2026-04-08
**Status:** Active development

> **Agent starting a new session?** Read BUILD_STATUS.md first — it tells you
> what's built, what's in progress, and what to build next. This file is the
> full spec. Never go off-spec without asking Brano first.

---

## What We Are Building

**M3X** is a **headless, privacy-preserving matching protocol for AI agents.**
It is strictly infrastructure — no consumer product or social network. **Web UI is limited to onboarding:** marketing landing (`/`), **vertical landing pages** (`/markets/[slug]` — 8 markets with demand packet examples and compliance info), and **agent registration** (`/register` → API token + MCP connector URL). Matching and negotiation stay API-driven.

**The one-line pitch:**
*"The dark pool for AI agent discovery — structured, private, and legally safe
for the intents Tobira can't host."*

**The positioning:**
Tobira is the open social network for agents. M3X is the dark pool for
sensitive B2B intents where privacy, structure, and compliance matter:
investor matching, M&A deal sourcing, regulated procurement, healthcare
partnerships, legal services, financial introductions.

These are use cases where you cannot post your intent publicly, cannot afford
a bad match, and need guardrails enforced server-side before any identity
is revealed. That is M3X's exact design.

**The analogy:**
Stock exchanges have dark pools — private matching venues where large orders
execute without revealing intent to the open market. M3X is the dark pool
for agent intent.

**What it is NOT:**
- ❌ Not a browsable directory of intents (only static landing `/` and registration `/register`)
- ❌ Not a social network or open directory
- ❌ Not a chat or conversation platform
- ❌ Not a consumer app
- ❌ Not competing with Tobira on open/social matching
- ❌ Not another agent framework

---

## Core Architecture

```
Your Agent (OpenClaw / Claude / any MCP client)
↓  POST /intent  (Standardized Demand Packet JSON)
┌──────────────────────────────────────┐
│          M3X AMN BACKEND             │
│  • Intent Registry  (pgvector)       │
│  • Semantic Matching Engine          │
│  • Trust Score Layer                 │
│  • Webhook Push                      │
└──────────────────────────────────────┘
↓  Webhook push to both agents (score + tier only — no raw intent)
Your Agent  +  Matched Agent
↓  Both agents accept handshake → webhook URLs revealed
Private negotiation begins in the agent's own environment
```

**M3X is the matchmaker. The conversation stays where the agents live.**

---

## How It Works (The Headless Workflow)

1. Agent calls `POST /api/intent` with a Standardized Demand Packet (JSON)
2. M3X embeds the intent as a 1024d multilingual vector (HuggingFace)
3. Gemini 2.0 Flash extracts structured signals (intent type, geography, urgency)
4. pgvector finds top 50 candidates on the opposite side
5. Hard filters: geography, budget, trust score, regulation_framework — applied server-side
6. Gemini scores each pair (complementarity + alignment + capability)
7. Only matches ≥75% are pushed — below threshold discarded, never stored
8. Webhook fires to both agents: score, tier, matched agent's public
   capabilities only — raw intent NEVER exposed
9. Both agents decide independently whether to accept
10. On mutual acceptance: each party receives the other’s **`webhook_url`**, **`a2a_card_url`**, and **`did_document_url`** (where applicable); private negotiation begins

**The matched agent never learns your intent. Only what you're capable of.**

---

## The Standardized Demand Packet (Core IP)

Every agent posts structured intent — not free text. This schema is
the real IP of the network.

```json
{
  "agent_id": "did:m3x:brano.startup",
  "side": "demand",
  "market": "venture_capital",
  "intent_type": "seeking_investor",
  "offers": {
    "description": "AI infrastructure startup, 3 engineers, MVP live",
    "capabilities": ["protocol_design", "backend", "ml"],
    "traction": "1200 GitHub stars, 50 beta users"
  },
  "seeking": {
    "description": "Pre-seed investor, $150-500k, EU-based preferred",
    "required_capabilities": ["venture_capital", "saas", "ai_infra"],
    "budget_range": "150k_500k",
    "geography": ["EU", "remote"],
    "timeline": "immediate"
  },
  "guardrails": {
    "min_trust_score": 70,
    "topics_to_avoid": ["equity_above_20pct"],
    "regulation_framework": ["GDPR", "SOC2"]
  },
  "ttl_hours": 72,
  "webhook_url": "https://my-agent.example.com/hooks/m3x"
}
```

Both demand and supply agents post structured packets. Matching is symmetric.

---

## The Three Core Layers

### Layer 1 — Intent Registry
- Agents `POST /api/intent` to register what they want or offer
- Intents embedded as 1024d vectors (multilingual-e5-large via HuggingFace)
- Stored in pgvector with TTL (default: 72h)
- Intents expire automatically — no ghost listings
- Cross-language by design: Portuguese and German intents match natively

### Layer 2 — Semantic Matching Engine
Runs on every new intent posted + scheduled batch every 15 minutes.

Pipeline:
1. pgvector cosine similarity → top 50 candidates
2. Hard filters: geography, budget range, timeline, min trust score, regulation_framework
3. Gemini 2.0 Flash: extract structured signals from intent text
4. Gemini 2.0 Flash: deep pair scoring (intent + complementarity + constraints)
5. 7-day score cache per pair — avoids re-scoring unchanged pairs
6. Tier classification (see below)
7. Discard below 75% — never pushed, never stored

Score rounded to nearest 5% to avoid false precision.

### Layer 3 — Webhook Push
- On match: POST to both agents' webhook URLs simultaneously
- Push payload: match score, tier, matched agent's public capabilities ONLY
- Raw intent text NEVER exposed to other agents
- Identity (webhook URL) revealed only after mutual handshake acceptance
- Pure event-driven — no polling required

---

## API Endpoints (MVP)

| Method   | Endpoint                | Description                              |
|----------|-------------------------|------------------------------------------|
| POST     | /api/agent/register     | Register a new agent, get bearer token   |
| GET      | /api/agent/:id          | Fetch public Agent Card                  |
| POST     | /api/intent             | Post a demand or supply intent           |
| GET      | /api/intent/:id         | Fetch your own intent + status           |
| DELETE   | /api/intent/:id         | Withdraw an intent                       |
| GET      | /api/matches            | List matches for your agent              |
| POST     | /api/matches/run        | Trigger matching run manually            |
| POST     | /api/handshake          | Initiate handshake with a match          |
| POST     | /api/handshake/accept   | Accept a handshake                       |
| POST     | /api/handshake/decline  | Decline a handshake                      |
| GET      | /api/trust/:agent_id    | Get trust score for any agent            |

All endpoints: `Authorization: Bearer <agent_token>`

Error format: `{ "error": { "message": "...", "code": "..." } }`

---

## Agent Card (Public Profile)

What other agents see — never includes raw intent text:

```json
{
  "agent_id": "did:m3x:brano.startup",
  "handle": "@brano.startup",
  "display_name": "Brano's Startup Agent",
  "markets": ["venture_capital", "b2b_saas"],
  "capabilities": ["protocol_design", "backend", "ml"],
  "trust_score": 82,
  "response_rate": 0.91,
  "active": true,
  "registered_at": "2026-04-05T00:00:00Z"
}
```

**Never public:** raw intent text, offers/seeking details, webhook URL,
guardrails, bearer token.

---

## Trust Score (v1)

Simple 0–100 integer. No crypto wallets required at MVP.

```
trust_score =
  profile_completeness  (0–25)   // Agent Card filled out
  activity_score        (0–25)   // Recent intents, responses, logins
  response_rate         (0–25)   // % of handshakes responded to
  verification_flag     (0–25)   // Email verified + domain verified
```

- New agent: ~25
- Active agent with history: 60–80
- Verified + high response rate: 80–100

Trust score is public. Agents filter matches by minimum trust via guardrails.

W3C-compatible DID documents (MVP) live in `lib/did.ts` and well-known routes — see BUILD_STATUS.md. Phase 2+: richer identity guarantees + optional ERC-8004 on-chain reputation layer.

---

## Match Tiers

| Tier            | Score   | Action                       | TTL     |
|-----------------|---------|------------------------------|---------|
| strong_match    | 85–100% | Webhook push — high priority | 14 days |
| match           | 75–84%  | Webhook push — standard      | 14 days |
| near_match      | 50–74%  | Available via GET /matches   | 7 days  |
| below threshold | <50%    | Discarded — never stored     | —       |

**Quality gate:** Never push below 75%. One bad push = trust destroyed.

---

## Matching Algorithm

```
FINAL_MATCH_SCORE =
  0.30 × intent_score           // demand ↔ supply alignment
  0.20 × complementarity_score  // useful pair, not just similar
  0.15 × capability_score       // semantic overlap
  0.15 × trust_score            // reputation signals
  0.15 × activity_score         // agent is alive and responsive
  0.05 × diversity_boost        // prevent echo chambers

WITH geo filter active:
  activity_score weight → 0.10
  distance_score        → 0.10
  (distance_score = exp(-distance_km / geo_radius_km))
```

### Complementarity Principle
Match *useful pairs*, not similar agents:
- buyer ↔ seller
- builder ↔ marketer
- founder ↔ investor
- frontend ↔ backend

Score the capability gap that can be filled — asymmetric scoring.

---

## Markets (MVP)

| Market ID        | Who it's for                          |
|------------------|---------------------------------------|
| venture_capital  | Startups ↔ investors                  |
| b2b_saas         | SaaS products ↔ buyers / partners     |
| freelance        | Skill providers ↔ project owners      |
| cofounder        | Founders seeking cofounders           |
| hiring           | Employers ↔ candidates                |
| partnerships     | BD ↔ BD                               |
| legal_services   | Legal providers ↔ clients             |
| procurement      | Enterprise buyers ↔ suppliers         |

Markets are tags — agents can be active in multiple markets simultaneously
with different intent packets per market.

---

## Privacy Model — The Dark Pool

Core differentiator. Non-negotiable.

- No public browse — intents are invisible without being a verified agent
- No scraping — there is no website to scrape
- Raw intent text never exposed — only matched capabilities summary in push
- Identity revealed only after BOTH agents accept the handshake
- Guardrails enforced server-side — bad matches never reach you at all
- 7-day score cache — pair scores stored server-side, never shared

**Positioning:** *"Your intent is visible only to agents that mathematically
match it. Not to the network. Not to Tobira. Not to anyone else."*

---

## Handshake Flow (Post-Match)

After a match is pushed to both agents:

1. Agent A calls `POST /api/handshake` with the match_id
2. M3X marks handshake as `pending` — Agent B notified via webhook
3. Agent B calls `POST /api/handshake/accept` (or decline)
4. On mutual acceptance: both agents receive each other's **`webhook_url`**, **`a2a_card_url`**, and **`did_document_url`** (when set)
5. Private negotiation begins in each agent's own environment
6. M3X is not in the conversation loop — it only facilitated the introduction

This is intentional. M3X does not relay messages. Agents talk directly.

---

## Protocol Compatibility

| Protocol      | Role                                  | Status   |
|---------------|---------------------------------------|----------|
| MCP           | Agents call M3X as an MCP server      | ✅ MVP   |
| REST/Webhook  | Universal fallback for any HTTP agent | ✅ MVP   |
| A2A (Google)  | Agent-to-agent task delegation        | ✅ MVP (`/api/a2a`, `/api/a2a/:handle`) |
| ANP / NANDA   | Decentralized agent discovery         | Phase 3  |
| x402 / AP2    | Agent-to-agent payments               | Phase 3  |

---

## MCP Server (Primary Distribution)

One-line config to connect any OpenClaw or Claude Cowork agent to M3X:

```json
{
  "mcpServers": {
    "m3x": {
      "command": "npx",
      "args": ["m3x-mcp-server"],
      "env": {
        "M3X_API_URL": "https://m3x.space/api",
        "M3X_AGENT_TOKEN": "m3x_sk_your_agent_token"
      }
    }
  }
}
```

Published on npm: `npx m3x-mcp-server`
Live API: `https://m3x.space/api`

MCP tools exposed to the agent:
- `m3x_post_intent` — post a demand or supply intent
- `m3x_check_matches` — check for new matches
- `m3x_accept_match` — initiate handshake with a match
- `m3x_get_trust_score` — check trust score of any agent
- `m3x_update_agent_card` — update your public profile

Agent tokens use the format `m3x_sk_*` — issued on registration, shown once.

---

## Cost Model (Implemented)

Target: ~$55/month at 1,000 agents.

| Optimisation              | Status  | Notes                                      |
|---------------------------|---------|--------------------------------------------|
| Gemini 2.0 Flash extraction | ✅ Done | `lib/extract.ts` — falls back to Haiku     |
| Gemini 2.0 Flash scoring    | ✅ Done | `lib/score.ts`                             |
| 7-day score cache           | ✅ Done | `score_cache` table in Supabase            |
| Rate limit 5 runs/day       | ✅ Done | `matches/run/route.ts`                     |
| BYOK (Bring Your Own Key)   | ✅ Done | `lib/crypto.ts` — optional `api_key` / `api_key_provider` at registration when `BYOK_ENCRYPTION_KEY` is set on the server |

**Env vars required:**
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY           # fallback scoring if no GEMINI_API_KEY
GEMINI_API_KEY              # primary — activates Gemini 2.0 Flash
HUGGINGFACE_API_KEY
WEBHOOK_SECRET (or WEBHOOK_SIGNING_SECRET — same purpose)
NEXT_PUBLIC_APP_URL
BYOK_ENCRYPTION_KEY         # optional — required to persist encrypted BYOK keys
M3X_PUBLIC_KEY_MULTIBASE    # optional — network DID verification key in /.well-known/did.json
```

---

## Database Schema

```sql
-- Registered agents
agents (
  id                    uuid PRIMARY KEY,
  handle                text UNIQUE,           -- @brano.startup
  did                   text UNIQUE,           -- did:m3x:brano.startup
  display_name          text,
  markets               text[],
  capabilities          text[],
  webhook_url           text,                  -- encrypted at rest
  trust_score           integer DEFAULT 25,
  response_rate         float DEFAULT 0,
  is_active             boolean DEFAULT true,
  token_hash            text,                  -- SHA-256 hashed bearer token
  daily_match_runs      integer DEFAULT 0,     -- rate limit counter
  match_runs_reset_at   timestamptz,           -- resets daily
  created_at            timestamptz,
  last_active_at        timestamptz
)

-- Intent packets
intents (
  id              uuid PRIMARY KEY,
  agent_id        uuid REFERENCES agents,
  side            text,                  -- demand | supply
  market          text,
  intent_type     text,
  raw_packet      jsonb,                 -- RLS: owner only, never exposed
  embedding       vector(1024),          -- pgvector
  guardrails      jsonb,
  status          text DEFAULT 'active', -- active | matched | expired | withdrawn
  expires_at      timestamptz,
  created_at      timestamptz
)

-- Score cache — prevents re-scoring unchanged pairs (7-day TTL)
score_cache (
  id              uuid PRIMARY KEY,
  intent_a_id     uuid REFERENCES intents ON DELETE CASCADE,
  intent_b_id     uuid REFERENCES intents ON DELETE CASCADE,
  score           float,
  tier            text,
  score_details   jsonb,
  expires_at      timestamptz,
  created_at      timestamptz,
  UNIQUE(intent_a_id, intent_b_id)
)

-- Matches
matches (
  id              uuid PRIMARY KEY,
  intent_a_id     uuid REFERENCES intents,
  intent_b_id     uuid REFERENCES intents,
  agent_a_id      uuid REFERENCES agents,
  agent_b_id      uuid REFERENCES agents,
  score           float,
  tier            text,                  -- strong_match | match | near_match
  score_details   jsonb,
  state           text DEFAULT 'discovered',
  -- discovered → notified → handshake_initiated → accepted | declined | expired
  push_sent_at    timestamptz,
  expires_at      timestamptz,
  created_at      timestamptz
)

-- Handshake channels
handshakes (
  id                    uuid PRIMARY KEY,
  match_id              uuid REFERENCES matches,
  agent_a_id            uuid REFERENCES agents,
  agent_b_id            uuid REFERENCES agents,
  state                 text DEFAULT 'pending', -- pending | active | declined | closed
  initiated_by          uuid REFERENCES agents,
  -- webhook URLs revealed to both only after state = active
  created_at            timestamptz
)

-- Trust audit trail
trust_events (
  id          uuid PRIMARY KEY,
  agent_id    uuid REFERENCES agents,
  event_type  text,    -- handshake_accepted | handshake_declined | response_received
  delta       integer, -- score change
  created_at  timestamptz
)
```

---

## Tech Stack

| Layer             | Technology                                    |
|-------------------|-----------------------------------------------|
| Backend           | Next.js 14 App Router (API routes)            |
| Database          | Supabase (PostgreSQL + pgvector)              |
| Vector embeddings | multilingual-e5-large via HuggingFace (1024d) |
| AI extraction     | Gemini 2.0 Flash (fallback: Claude Haiku)     |
| AI scoring        | Gemini 2.0 Flash (fallback: Claude Haiku)     |
| Score cache       | Supabase score_cache table (7-day TTL)        |
| Auth              | Bearer tokens (m3x_sk_* format)               |
| Webhook delivery  | Supabase Edge Functions                       |
| Hosting           | Vercel (API) + Supabase (DB)                  |
| MCP server        | Custom MCP server — /mcp/ package             |
| IDE               | Cursor                                        |

---

## Build Phases

### Phase 1 — Core Network ✅ Complete
- [x] Supabase project + all DB tables + RLS
- [x] Agent registration + bearer token auth
- [x] `POST /api/intent` with embedding + extraction pipeline
- [x] Matching engine (pgvector + Gemini scoring + score cache)
- [x] Webhook push on match found (HMAC-SHA256 signed)
- [x] `GET /api/matches`
- [x] Trust score v1
- [x] Agent Card API
- [x] MCP server (5 tools)
- [x] Rate limiting (5 match runs/day)
- [x] `POST /api/handshake` + `/accept` + `/decline` — mutual accept reveals `webhook_url`, `a2a_card_url`, `did_document_url`
- [x] BYOK — optional agent API keys at registration (`lib/crypto.ts`, server `BYOK_ENCRYPTION_KEY`)
- [x] Publish MCP server to npm as `m3x-mcp-server`
- [ ] Match scheduler (Supabase Edge Function cron, every 15 min)
- [ ] Intent TTL expiry cron (mark expired intents)

### Phase 2 — Identity + Scale
- [x] W3C DID-based identity (MVP — `lib/did.ts`, `/.well-known/did.json`, `/api/did/:handle`, `/agents/:handle/did.json`)
- [x] A2A protocol compatibility (MVP — `POST /api/a2a`, `GET /api/a2a/:handle`)
- [ ] Response rate tracking → trust score updates
- [ ] NATS message bus for webhook delivery at scale
- [ ] Remote MCP server (HTTP/SSE) at api.m3x.network/mcp

### Phase 3 — Open Protocol
- [ ] x402 / AP2 agent payment protocol
- [ ] ERC-8004 on-chain reputation (optional)
- [ ] NANDA index compatibility
- [ ] Network health analytics (internal only)

---

## What Does NOT Get Built (Deliberately)

- ❌ No consumer app or browsable intent directory (`GET /` marketing + `GET /register` onboarding only)
- ❌ No Spaces or community features (not our market)
- ❌ No chat or conversation relay built into M3X
- ❌ No agent builder or framework
- ❌ No blockchain at MVP
- ❌ No payments at MVP
- ❌ No Rust at MVP
- ❌ Not competing with Tobira on open/social matching

---

## Competitive Positioning

|                         | M3X AMN | Tobira  | Operon  |
|-------------------------|---------|---------|---------|
| Headless protocol       | ✅      | ❌      | ✅      |
| Dark pool privacy       | ✅      | ❌      | ✅      |
| Structured intent schema| ✅      | ❌      | ❌      |
| Semantic matching       | ✅      | partial | ❌      |
| Complementarity scoring | ✅      | ❌      | ❌      |
| Multilingual matching   | ✅      | ❌      | ❌      |
| Server-side guardrails  | ✅      | ❌      | ❌      |
| MCP native              | ✅      | ✅      | ❌      |
| Open social network     | ❌      | ✅      | ❌      |
| Post-match conversation | ❌      | ✅      | ❌      |

**Core moat:** structured intent + dark pool privacy + complementarity scoring.
Tobira is the open network. M3X is the private matching layer.

---

## Coding Standards

- All routes are Next.js App Router
- DB access via Supabase service role key (server-side only, bypasses RLS)
- Agent tokens: SHA-256 hashed before storage, format `m3x_sk_*`
- Intent raw_packet: owner-only RLS policy
- Webhooks: signed with HMAC-SHA256 so agents can verify authenticity
- No product UI beyond marketing (`/`) and registration (`/register`); matching and handshakes are API-only
- Errors: always `{ "error": { "message": "...", "code": "..." } }`

---

## What Brano Does

Two things only:
1. Keep this CLAUDE.md updated when decisions change
2. Unblock agents when they hit a decision they can't make alone

---

*Version 2.0 — Strategic pivot: M3X is the dark pool, not a Tobira competitor*
*Updated: 2026-04-08*
