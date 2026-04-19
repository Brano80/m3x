# M3X Security Rules

## Non-negotiable before any deploy

### Input validation
- All route params (agent ID, intent ID, handle) validated against strict regex before DB use
- UUID format: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`
- Handle format: `/^[a-z0-9._-]{1,64}$/`
- DID format: `/^did:m3x:[a-z0-9._-]{1,64}$/`
- Never interpolate user input into PostgREST filter strings — use `.eq()` with pre-validated value

### SSRF protection
- Any endpoint that saves a `webhook_url` must call `isSafeWebhookUrl()` from `lib/ssrf.ts` first
- `isSafeWebhookUrl()` requires https://, DNS-resolves hostname, blocks RFC1918/loopback/link-local/ULA
- Applied in: `POST /api/agent/register`, `PATCH /api/agent/me`

### Auth hardening
- `WEBHOOK_SECRET` must be set — lib/webhook.ts throws `Error('WEBHOOK_SECRET env var is required')` if missing
- Gemini API key goes in `x-goog-api-key` header — never in URL query string
- Cron routes use `crypto.timingSafeEqual` for secret comparison
- Debug endpoint returns 404 when `DEBUG_SECRET` env var is unset
- Registration rate limited: 5 per IP per hour (in-memory `ipRegistry` in register/route.ts)

### Privacy (dark pool model — non-negotiable)
- `webhook_url` never appears in: DID documents, A2A agent cards, public agent cards, any GET response
- `raw_packet` (intent text) never exposed to anyone other than the owning agent
- `score_details` must not echo raw intent text
- Identity (webhook_url, a2a_card_url, did_document_url) revealed only after `handshake.state = active`

### LLM prompt safety
- Demand Packet context in LLM prompts goes through `safeIntentSummary()` — extracts only typed scalar fields
- Never pass `JSON.stringify(raw_packet)` to any LLM call
- Message content capped at 300 chars in prompts
- See `app/api/conversations/[id]/draft/route.ts` for reference implementation

### BYOK encryption
- `lib/crypto.ts`: `encryptKey()` generates random 16-byte salt per record
- Format: `iv:salt:tag:ciphertext` (4 parts)
- Legacy 3-part format (static salt) still decrypts for existing rows
- Never log or return `byok_key_enc`

## Known open issues (accepted, not yet fixed)
These are tracked in BUILD_STATUS.md security audit section. Don't re-report as new.

| ID | Issue |
|----|-------|
| M2 | verifyAgent token lookup not constant-time |
| M3 | No token rotation/revocation endpoint — needed before public launch |
| M4 | PATCH /api/agent/me allows webhook_url change without re-verification |
| M5 | public_key_multibase self-asserted, no proof-of-possession |
| M7 | raw_packet stored plaintext JSONB — RLS audit pending |
| M8 | Webhooks fire-and-forget, no retry/dead-letter |
| M10 | XSS surface in conversation content — confirm no dangerouslySetInnerHTML |
| M11 | No CORS restriction on state-changing routes |
| M12 | Followup cron scales with Gemini calls per session |
| Low | No CSP/security headers in next.config.ts |
| Low | Intent TTL 720h in code vs 72h in spec — align before launch |
| Low | No max-length on offers/seeking description fields |
