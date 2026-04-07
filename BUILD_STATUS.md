# BUILD_STATUS.md — M3X Agentic Matchmaking Network
**Last updated:** 2026-04-07
**Updated by:** Claude (Cowork session)

---

## Current State: Phase 1 — Core Network (In Progress)

### ✅ Done

| Item | Notes |
|------|-------|
| Supabase DB — all 5 tables | agents, intents, matches, handshakes, trust_events — RLS enabled |
| Agent registration (`POST /api/agent/register`) | Bearer token issued, SHA-256 hashed before storage |
| Agent card (`GET /api/agent/:id`) | Public profile, never exposes raw intent or webhook |
| My agent (`GET /api/agent/me`) | Auth-gated, returns full agent record |
| Post intent (`POST /api/intent`) | Gemini extraction (`lib/extract.ts`, fallback Haiku) + HF embedding |
| Get/delete intent (`GET /DELETE /api/intent/:id`) | Owner-only |
| Run matching (`POST /api/matches/run`) | pgvector top-50 → Gemini scoring (fallback Haiku) → webhook push |
| Get matches (`GET /api/matches`) | Tier + score filter, paginated |
| Trust score (`GET /api/trust/:agent_id`) | Returns public trust score |
| Webhook push | HMAC-SHA256 signed, fires to both agents on match |
| MCP server (`/mcp/`) | 5 tools: post_intent, check_matches, accept_match, get_trust_score, update_agent_card — published to npm as `m3x-mcp-server@1.0.0` |
| Handshake (`POST /api/handshake`, `/accept`, `/decline`) | Mutual accept reveals webhook URLs; bearer auth |
| Public stats (`GET /api/stats`) | `force-dynamic`; counts all registered agents + matches. Needs `SUPABASE_SERVICE_ROLE_KEY` on Vercel (same as rest of API) |
| Debug endpoint (`GET /api/debug`) | Booleans for Anthropic, HF, Supabase service, BYOK encryption configured (no auth) |

**Live data in DB:** 5 agents · 4 intents · 2 matches · 0 handshakes

---

## Phase 1 — ✅ Complete

All Phase 1 items shipped. See commit history.

Last additions:
- `docs/openclaw-connector.md` — full setup guide for OpenClaw + Claude Cowork agents

---

## Phase 2 — In Progress

### ✅ Done

| Item | Notes |
|------|-------|
| Response rate tracking → trust score updates | `lib/trust.ts` — full 4-component formula; trust_events populated on every accept/decline |
| Anti-spam / rate limiting on intent posting | 5 active intents max + 10 posts/24h; enforced before extraction pipeline |
| GEMINI_API_KEY in Vercel + Supabase secrets | Activates Gemini 2.0 Flash for extraction + scoring; cuts AI cost ~10x |

### ❌ Not Built Yet

| Item | Notes |
|------|-------|
| W3C DID-based identity | Upgrade from simple `did:m3x:` prefix to proper W3C DID documents |
| A2A protocol compatibility | Google agent-to-agent task delegation |
| NATS message bus | Replace direct webhook calls at scale (~10k agents) |

---

## 💡 Possible Add-on — Agent Messaging Layer (to be discussed)

> After a handshake is accepted, M3X currently steps out and the parties are expected to communicate directly via webhook. For Cowork/conversational agents that have no persistent server, there is no "last mile" — the user would need to contact the other party manually.
>
> **Proposed:** A thin async messaging layer inside M3X:
> - `POST /api/message` — send a short structured message to a matched counterpart (requires active handshake)
> - `GET /api/messages` — poll for new incoming messages
> - New `messages` table: `(id, handshake_id, sender_id, recipient_id, content, read, created_at)`
> - Cowork scheduled task ("m3x inbox checker") polls every hour and reports new messages
>
> This would enable the full flow: match → handshake → async back-and-forth via agents, without either side needing a persistent server.
> M3X stays a matchmaker + lightweight relay — not a chat platform. Messages are short, structured, and expire with the handshake.
>
> **Discuss with Brano before building.**

---

## ❌ Not Built Yet (Phase 3)

| Item | Notes |
|------|-------|
| x402 / AP2 agent payment protocol | |
| ERC-8004 on-chain reputation | Optional layer |
| NANDA index compatibility | |
| M3X mobile cockpit | Control plane app |
| Network health analytics dashboard | |

---

## Cost Optimisation Plan

Target: **~$120/month at 1,000 agents** (vs ~$800/month without optimisations)

| Optimisation | Impact | Status |
|---|---|---|
| Gemini 2.0 Flash for extraction | Extraction cost: $75 → $1/month | ✅ Done — `lib/extract.ts`, falls back to Haiku if no GEMINI_API_KEY |
| 7-day score cache per agent pair | Scoring calls: -80% | ✅ Done — `score_cache` table + `lib/score.ts` |
| Rate limit: 5 match runs/day/agent | Prevents runaway costs | ✅ Done — `matches/run/route.ts`, resets at UTC midnight |
| BYOK for paid tier | Infra AI cost → $0 for power users | ✅ Done — AES-256 encrypted, injected at extract + score time |

**Required env var to activate Gemini:** Add `GEMINI_API_KEY` to Vercel environment variables.

---

## Next Task to Build

**Phase 2 next:** W3C DID-based identity — upgrade agent DIDs from simple `did:m3x:handle` prefix to proper W3C DID documents with a `did:web` or custom `did:m3x` method. Enables cross-network agent identity verification.

---

## E2E Test Results (2026-04-07)

Ran a full live end-to-end diagnostic against `https://m3x.space/api` and Supabase:

| Layer | Status | Notes |
|---|---|---|
| Agent registration | ✅ | 5 agents live |
| Intent posting + embedding | ✅ | 4 intents, all with 1024d embeddings |
| pgvector similarity search | ✅ | `match_intents_by_intent_id` returns candidates at 0.88+ similarity |
| AI scoring (Next.js API path) | ✅ | Original 3 matches created via `/api/matches/run` |
| Score cache writes | 🔧 Fixed | Was fire-and-forget → lost in Vercel serverless. Now `await`ed. |
| Infra Gemini path in lib/score.ts | 🔧 Fixed | Was missing — only BYOK Gemini existed. Now falls back to `GEMINI_API_KEY` env var before Haiku. |
| Scheduler auth | 🔧 Fixed | v2 compared `SUPABASE_ANON_KEY` env var which mismatched. Switched to `verify_jwt: true` (Supabase validates the JWT natively). |
| Scheduler embedding bug | 🔧 Fixed | Scheduler was passing `intent.embedding` (returned as string by REST API) to the RPC — fails silently. Fixed with new `match_intents_by_intent_id` SQL function (vector stays in Postgres). |
| Scheduler AI keys | ❌ Needs action | `ANTHROPIC_API_KEY` not in Supabase secrets → scoring always returns null → 0 matches from scheduler. See above. |
| Webhook push | ✅ (code) | Fires on match with score ≥75% — untested at scale since test agents scored 65-70% (expected for agents with empty capabilities). |
| Handshake flow | ✅ (code) | Endpoints exist, identity reveal on mutual acceptance. No handshakes yet (no matches above 75% threshold). |

---

## Environment Variables Required

```
NEXT_PUBLIC_SUPABASE_URL    # required on Vercel (not only local) — /api/stats and client need it
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY   # required on Vercel for DB-backed routes and /api/stats
ANTHROPIC_API_KEY
HUGGINGFACE_API_KEY
GEMINI_API_KEY          # activates Gemini 2.0 Flash for extraction (10x cheaper)
WEBHOOK_SECRET            # HMAC for outbound webhooks (alias: WEBHOOK_SIGNING_SECRET)
NEXT_PUBLIC_APP_URL
BYOK_ENCRYPTION_KEY     # optional — required on server to accept BYOK at registration (e.g. openssl rand -hex 32)
```