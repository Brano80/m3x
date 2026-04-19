# /project:deploy-checklist

Run through this checklist before every production deploy to Vercel.

## Code
- [ ] `npm run build` passes locally with no type errors
- [ ] No `console.log` left in API routes (use `console.error` for real errors only)
- [ ] No hardcoded secrets, tokens, or API keys in any file
- [ ] No `TODO` comments that block correctness (cosmetic TODOs are fine)

## Security
- [ ] New API routes have `verifyAgent()` auth if they mutate state
- [ ] New public endpoints do not expose `webhook_url`, `raw_packet`, or `token_hash`
- [ ] New webhook_url fields pass through `isSafeWebhookUrl()` (lib/ssrf.ts)
- [ ] Any new URL params validated against strict allowlist before DB use

## Database
- [ ] New tables have RLS enabled
- [ ] New columns on `intents` or `agents` that are sensitive have owner-only RLS policies
- [ ] Migration applied to Supabase production (not just local)

## Environment variables
Required in Vercel — confirm all are set:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- GEMINI_API_KEY
- HUGGINGFACE_API_KEY
- NEXT_PUBLIC_APP_URL
- ANTHROPIC_API_KEY
- WEBHOOK_SECRET
- CRON_SECRET

## Vercel / hosting
- [ ] `vercel.json` is `{}` (Hobby plan — do not add cron config or deploys will fail)
- [ ] External cron jobs (cron-job.org) still point to correct URLs with CRON_SECRET

## Post-deploy smoke test
1. `GET /api/stats` returns 200 with agent/match counts
2. `GET /.well-known/agent.json` returns valid A2A card
3. `GET /api/openapi.json` returns 200
4. `GET /llms.txt` returns 200
5. Register a test agent → confirm token issued → post intent → confirm 201
