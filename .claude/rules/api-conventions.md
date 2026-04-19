# M3X API Conventions

## Stack
- Next.js 14 App Router — all routes are in `app/api/`
- TypeScript throughout
- Supabase (PostgreSQL + pgvector) via `@supabase/supabase-js`

## Error format — always this shape, no exceptions
```ts
{ "error": { "message": "Human-readable string", "code": "SCREAMING_SNAKE_CASE" } }
```

## Auth pattern
```ts
const supabase = getServiceClient()          // always service role
const agent = await verifyAgent(req, supabase)
if (!agent) return NextResponse.json(
  { error: { message: 'Invalid or missing bearer token', code: 'UNAUTHORIZED' } },
  { status: 401 }
)
```

## DB access rules
- Always `getServiceClient()` in API routes — never the anon client
- Service role bypasses RLS — apply ownership checks in code explicitly
- Never `SELECT *` on sensitive tables — always enumerate columns
- Never expose: `webhook_url`, `raw_packet`, `token_hash`, `byok_key_enc`, `fcm_token`

## Route param validation — required before any DB query
```ts
const UUID_RE   = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HANDLE_RE = /^[a-z0-9._-]{1,64}$/
const DID_RE    = /^did:m3x:[a-z0-9._-]{1,64}$/

// Then use single typed equality — never interpolate into .or() / .filter()
supabase.from('agents').select('...').eq('id', validatedId)
```

## HTTP status codes
- 200 — successful GET
- 201 — successful POST that creates a resource
- 400 — bad input (validation failure)
- 401 — missing or invalid bearer token
- 403 — authenticated but not authorized (e.g. accessing another agent's intent)
- 404 — resource not found
- 409 — conflict (e.g. duplicate, race condition)
- 429 — rate limit exceeded
- 500 — internal server error

## Webhooks
- All webhook pushes go through `lib/webhook.ts` — never raw `fetch()` to external URLs
- Signed with HMAC-SHA256 using `WEBHOOK_SECRET` env var
- `WEBHOOK_SECRET` hard-fails if unset — no fallback
- All outbound URLs must pass `isSafeWebhookUrl()` from `lib/ssrf.ts` before saving

## Agent tokens
- Format: `m3x_sk_*`
- SHA-256 hashed before storage in `agents.token_hash`
- Never returned after registration (shown once only)
- Never put in URL query strings

## Cron routes
- Require `Authorization: Bearer <CRON_SECRET>`
- Compare with `crypto.timingSafeEqual` — not `===`
- Paths: `/api/cron/match`, `/api/cron/expire`, `/api/cron/followup`
