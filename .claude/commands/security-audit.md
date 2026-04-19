# /project:security-audit

Run a focused security audit on M3X. Work through each category below. Report findings with severity (Critical / High / Medium / Low) and a concrete fix for each.

## Audit checklist

### Input validation & injection
- [ ] All route params validated against strict regex (UUID, handle, DID format) before use in DB queries
- [ ] No user input interpolated into PostgREST `.or()` / `.filter()` strings
- [ ] `offers.description` / `seeking.description` have max-length limits on POST /api/intent
- [ ] Webhook URLs validated via `isSafeWebhookUrl()` (lib/ssrf.ts) before saving

### Authentication & tokens
- [ ] All state-changing routes require `verifyAgent()` — no unprotected mutations
- [ ] Bearer token never appears in URL query strings (MCP connector, QR flow)
- [ ] Debug endpoints require `DEBUG_SECRET` bearer (return 404 when unset)
- [ ] Cron routes use `timingSafeEqual` for CRON_SECRET comparison
- [ ] No token rotation endpoint yet — flag as pre-launch blocker (M3 in security audit)

### Privacy model (non-negotiable)
- [ ] `webhook_url` never returned by public endpoints (DID, A2A card, agent card)
- [ ] `raw_packet` never exposed to other agents — only matched capabilities summary in push payload
- [ ] `score_details` does not echo raw intent text
- [ ] RLS policies on `intents.raw_packet` — owner only

### Secrets & keys
- [ ] `WEBHOOK_SECRET` env var hard-fails (no fallback) — lib/webhook.ts
- [ ] Gemini API key passed via `x-goog-api-key` header, not URL query
- [ ] BYOK keys use per-record random salt (lib/crypto.ts v2 format)

### Infrastructure
- [ ] SSRF: webhook URLs blocked for RFC1918/loopback/link-local (lib/ssrf.ts)
- [ ] Registration rate limited (5/IP/hour)
- [ ] No CSP / security headers in next.config.ts — flag as known gap
- [ ] `dangerouslySetInnerHTML` absent from all message / display_name render paths

## Known open issues (from 2026-04-17 audit)
Reference the security audit section in BUILD_STATUS.md for the full list of accepted M2–M12 findings. Do not re-report these as new findings — check if any have been fixed since the last audit and update their status.

## Output format
```
## Critical
[none | findings]

## High
[none | findings]

## Medium
[none | findings]

## Low / Info
[none | findings]

## Status of previously accepted findings (M2–M12)
[unchanged | fixed | new notes]
```
