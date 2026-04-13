# BUILD_STATUS.md — M3X Agentic Matchmaking Network
**Last updated:** 2026-04-13 (crons added)

---

## Current state

**Phase 1 — ✅ complete**. **Phase 2 — partially complete**. **Phase 3** — not started.

---

## ✅ Done — Core API & matching

| Item | Notes |
|------|-------|
| Supabase DB — core tables | agents, intents, matches, handshakes, trust_events — RLS enabled |
| Agent registration (`POST /api/agent/register`) | Bearer token issued, SHA-256 hashed; token format `m3x_sk_*`; optional BYOK when `BYOK_ENCRYPTION_KEY` set |
| Agent card (`GET /api/agent/:id`) | Public profile |
| My agent (`GET` / `PATCH /api/agent/me`) | Auth-gated; PATCH updates `display_name`, `markets`, `capabilities`, `webhook_url` |
| Post intent (`POST /api/intent`) | Gemini extraction (`lib/extract.ts`, fallback Haiku) + HF embedding; rate limits (max **5** active intents, **10** posts / 24h) |
| Get/delete intent (`GET` / `DELETE /api/intent/:id`) | Owner-only |
| Run matching (`POST /api/matches/run`) | pgvector → Gemini scoring → webhook push; daily run limit (5/day) |
| Get matches (`GET /api/matches`) | Tier + score filter |
| Trust (`GET /api/trust/:agent_id`) | Public score; full recalculation in `lib/trust.ts` |
| Webhook push | HMAC (`WEBHOOK_SECRET` / alias `WEBHOOK_SIGNING_SECRET`) |
| Handshake (`POST /api/handshake`, `/accept`, `/decline`) | On mutual accept: **`webhook_url`**, **`a2a_card_url`**, **`did_document_url`** per party; smart auto-accept if other party already initiated |
| Public stats (`GET /api/stats`) | Registered agents + match counts |
| Marketing site (`GET /`) | Landing page; hero stats from `/api/stats` |
| Agent registration UI (`GET /register`) | Client form → `POST /api/agent/register`; success shows bearer token + MCP connector URL |
| MCP server (`/api/mcp`) | Remote Streamable HTTP — 6 tools: `m3x_post_intent`, `m3x_check_matches`, `m3x_accept_match`, `m3x_get_trust_score`, `m3x_update_agent_card`, `m3x_run_matching` |
| MCP npm package | `m3x-mcp-server` on npm |
| CORS | Browser/Electron MCP clients supported |

---

## ✅ Done — Identity, DID, A2A

| Item | Notes |
|------|-------|
| `GET /.well-known/agent.json` | M3X A2A discovery card |
| `GET /.well-known/did.json` | Network `did:web:<domain>` document |
| `GET /api/did/:handle` | W3C DID Document for `did:m3x:<handle>` |
| `GET /agents/:handle/did.json` | `did:web` path |
| `lib/did.ts` | DID construction with services, extensions, `alsoKnownAs` |
| `POST /api/a2a` | JSON-RPC 2.0 — `tasks/send` / `tasks/get` |
| `GET /api/a2a/:handle` | Per-agent A2A card (public) |

---

## ✅ Done — Scoring & trust fixes (2026-04-13)

| Item | Notes |
|------|-------|
| Trust score floor | New agents score 0.5 (neutral) not 0.25 — `max(0.5, trust/100)` in scoring prompt |
| Scoring weights rebalanced | intent 0.40, complementarity 0.25, capability 0.15, trust 0.10, activity 0.05, diversity 0.05 |
| Embedding fetch fix | Embedding fetched in separate query to avoid pgvector type issues via REST API |
| E2E verified | @blueprint ↔ @brano: score **0.80** (intent 0.95, complementarity 0.95) → handshake → identity reveal ✅ |

---

## ✅ Done — Cron jobs (2026-04-13)

| Item | Notes |
|------|-------|
| **Match scheduler cron** (`GET /api/cron/match`) | Vercel Cron — runs every 15 min (Pro) / daily (Hobby); CRON_SECRET protected; full matching loop with score cache; webhook push |
| **Intent TTL expiry cron** (`GET /api/cron/expire`) | Vercel Cron — runs every hour; marks expired intents `status='expired'` + matches `state='expired'` |
| `vercel.json` | `*/15 * * * *` for match, `0 * * * *` for expire |

**Required env var:** `CRON_SECRET` — add to Vercel dashboard (any random string; Vercel auto-sets `Authorization: Bearer <secret>` on cron requests)

---

## ❌ Phase 1 — remaining

~~All Phase 1 items complete.~~ Phase 1 is now **100% done**.

---

## Phase 2 — remaining

| Item | Priority | Notes |
|------|----------|-------|
| Response rate tracking | Medium | Update trust score after handshake accepted/declined |
| NATS message bus | Low | Replace direct webhooks at scale — defer until needed |

---

## ❌ Phase 3 (not started)

x402/AP2, ERC-8004, NANDA index, network analytics dashboard.

---

## 💡 Possible add-on — agent messaging layer

After handshake, M3X steps out; parties use webhooks/A2A. For agents without a persistent server, a thin `POST /api/message` + `GET /api/messages` relay was proposed — **not built**. Discuss with Brano before implementing.

---

## Environment variables (production — Vercel)

```
NEXT_PUBLIC_SUPABASE_URL        ✅
NEXT_PUBLIC_SUPABASE_ANON_KEY   ✅
SUPABASE_SERVICE_ROLE_KEY       ✅
GEMINI_API_KEY                  ✅
HUGGINGFACE_API_KEY             ✅
NEXT_PUBLIC_APP_URL             ✅
ANTHROPIC_API_KEY               ✅  added to Vercel
WEBHOOK_SECRET                  ⚠️  not confirmed in Vercel — add if missing
CRON_SECRET                     ⚠️  new — add to Vercel (any random string)
BYOK_ENCRYPTION_KEY             optional
M3X_PUBLIC_KEY_MULTIBASE        optional
```

---

## Cost optimisation

| Optimisation | Status |
|---|---|
| Gemini 2.0 Flash extraction/scoring | ✅ `lib/extract.ts`, `lib/score.ts` |
| 7-day `score_cache` | ✅ |
| Match run rate limit (5/day) | ✅ |
| BYOK | ✅ `lib/crypto.ts` when `BYOK_ENCRYPTION_KEY` set |

---

## Decisions log

| Date | Decision |
|------|----------|
| 2026-04-08 | Strategic pivot: M3X is the dark pool, not a Tobira competitor |
| 2026-04-08 | A2A MVP paths follow actual A2A v1.0 spec — Cursor suggestions deferred |
| 2026-04-08 | `regulation_framework` guardrails and `real_estate` market deferred to Phase 2 |
| 2026-04-13 | Scoring weights rebalanced — intent alignment drives score, not agent history |
| 2026-04-13 | Push threshold kept at 0.75 — quality gate maintained |
