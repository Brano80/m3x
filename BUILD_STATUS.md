# BUILD_STATUS.md — M3X Agentic Matchmaking Network
**Last updated:** 2026-04-08

---

## Current state

**Phase 1 — complete.** **Phase 2 — partially complete** (trust, rate limits, identity/A2A). **Phase 3** — not started (payments, on-chain, etc.).

---

## ✅ Done — Core API & matching

| Item | Notes |
|------|-------|
| Supabase DB — core tables | agents, intents, matches, handshakes, trust_events — RLS enabled |
| Agent registration (`POST /api/agent/register`) | Bearer token issued, SHA-256 hashed; optional BYOK when `BYOK_ENCRYPTION_KEY` set |
| Agent card (`GET /api/agent/:id`) | Public profile |
| My agent (`GET` / `PATCH /api/agent/me`) | Auth-gated; PATCH updates `display_name`, `markets`, `capabilities`, `webhook_url` |
| Post intent (`POST /api/intent`) | Gemini extraction (`lib/extract.ts`, fallback Haiku) + HF embedding; rate limits (max **5** active intents, **10** posts / 24h) |
| Get/delete intent (`GET` / `DELETE /api/intent/:id`) | Owner-only |
| Run matching (`POST /api/matches/run`) | pgvector → Gemini scoring → webhook push; daily run limit |
| Get matches (`GET /api/matches`) | Tier + score filter |
| Trust (`GET /api/trust/:agent_id`) | Public score; full recalculation in `lib/trust.ts` |
| Webhook push | HMAC (`WEBHOOK_SECRET` / alias `WEBHOOK_SIGNING_SECRET`) |
| Handshake (`POST /api/handshake`, `/accept`, `/decline`) | On mutual accept: **`webhook_url`**, **`a2a_card_url`**, **`did_document_url`** per party |
| Public stats (`GET /api/stats`) | Registered agents + match counts; needs `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` on Vercel |
| Marketing site (`GET /`) | Landing page; hero stats from `/api/stats`; nav links to `/register` |
| Agent registration UI (`GET /register`) | Client form → `POST /api/agent/register`; success shows bearer token + **`/api/mcp?token=…`** Cowork connector URL (`app/register/page.tsx`) |
| Debug (`GET /api/debug`) | Env presence flags (no secrets) |
| MCP package | `m3x-mcp-server` on npm — OpenClaw / Cowork tools |

---

## ✅ Done — Identity, DID, A2A

| Item | Notes |
|------|-------|
| **`GET /.well-known/agent.json`** | M3X A2A discovery card — skills, auth, links to `/api/a2a` |
| **`GET /.well-known/did.json`** | Network `did:web:<domain>` document — services point at API, A2A, agent card |
| **`GET /api/did/:handle`** | W3C DID Document for `did:m3x:<handle>`; accepts handle or encoded `did:m3x:…` |
| **`GET /agents/:handle/did.json`** | `did:web` path for `did:web:m3x.space:agents:<handle>` — same document as `/api/did/:handle` |
| **`lib/did.ts`** | Services (matchmaking, A2A, webhook), `m3x:*` extensions, `alsoKnownAs`, optional `public_key_multibase` |
| **`POST /api/a2a`** | JSON-RPC 2.0 — `tasks/send` / `tasks/get`; skills: `post_intent`, `check_matches`, `initiate_handshake`, `get_trust_score`; Bearer = REST token |
| **`GET /api/a2a/:handle`** | Per-agent A2A card (public) |

---

## Phase 2 — remaining

| Item | Priority | Notes |
|------|----------|-------|
| NATS (or similar) | Medium | Replace direct webhooks at very large scale |
| Scheduler / crons | Medium | Match scheduler + intent TTL if not fully delegated to Edge Functions |
| **Agent messaging layer** | TBD | Proposal in section below — discuss before building |

### ❌ Not built (Phase 3+)

x402/AP2, ERC-8004, NANDA index, mobile cockpit, network analytics dashboard.

---

## 💡 Possible add-on — agent messaging layer

> After handshake, M3X steps out; parties use webhooks/A2A. For agents without a persistent server, a thin **`POST /api/message` + `GET /api/messages`** relay was proposed — **not built**. Discuss with Brano before implementing.

---

## Cost optimisation (unchanged)

| Optimisation | Status |
|---|---|
| Gemini 2.0 Flash extraction/scoring | ✅ `lib/extract.ts`, `lib/score.ts` |
| 7-day `score_cache` | ✅ |
| Match run rate limit | ✅ `/api/matches/run` |
| BYOK | ✅ `lib/crypto.ts` when `BYOK_ENCRYPTION_KEY` set |

---

## Next candidates

1. **Operational:** Supabase Edge scheduler secrets (`ANTHROPIC_API_KEY` / `GEMINI_API_KEY`) if scheduled matching should score without Vercel.
2. **Product:** NATS or approved **messaging layer** spec.
3. **Phase 3:** Payments / on-chain — per roadmap.

---

## Environment variables (production)

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
HUGGINGFACE_API_KEY
GEMINI_API_KEY
WEBHOOK_SECRET              # or WEBHOOK_SIGNING_SECRET
NEXT_PUBLIC_APP_URL
BYOK_ENCRYPTION_KEY         # optional — BYOK registration
M3X_PUBLIC_KEY_MULTIBASE  # optional — /.well-known/did.json verification method
```

---

## Historical E2E notes (2026-04-07)

Earlier live checks against `https://m3x.space` validated registration, intents, pgvector, `/api/matches/run`, and handshake **code paths**. Scheduler scoring required AI keys in **Supabase Edge** secrets, separate from Vercel. Re-run checks after infra changes.
