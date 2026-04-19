# /project:new-endpoint

Scaffold a new API endpoint for M3X. Follow this checklist exactly.

## Usage
Describe the endpoint you want: method, path, what it does, who can call it.

## Scaffold checklist

### File location
- Place at `app/api/<resource>/route.ts` (App Router convention)
- Use `app/api/<resource>/[id]/route.ts` for resource-scoped routes

### Auth
- All non-public routes must call `verifyAgent(req, supabase)` at the top
- Return 401 `UNAUTHORIZED` immediately if agent is null
- Public routes (no auth): only GET on public agent cards, stats, DID docs, A2A cards

### DB access
- Always use `getServiceClient()` — never the anon client in API routes
- Service role bypasses RLS — apply your own ownership checks in code

### Error format (always)
```ts
return NextResponse.json(
  { error: { message: 'Human-readable message', code: 'SCREAMING_SNAKE_CODE' } },
  { status: 4xx }
)
```

### Input validation
- Validate all route params (UUID, handle, DID) with regex before DB use
- Never interpolate user input into PostgREST `.or()` / `.filter()` strings
- Use `.eq('id', id)` with a pre-validated value — never `.or(\`id.eq.${id}\`)`

### Privacy
- Never return `webhook_url`, `raw_packet`, `token_hash`, `byok_key_enc` in any response
- If returning agent data, use an explicit SELECT list — never `SELECT *`

### Response
- 200 for GET, 201 for successful POST that creates a resource
- Always return JSON

### Template
```ts
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { verifyAgent } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const supabase = getServiceClient()
  const agent = await verifyAgent(req, supabase)
  if (!agent) {
    return NextResponse.json(
      { error: { message: 'Invalid or missing bearer token', code: 'UNAUTHORIZED' } },
      { status: 401 }
    )
  }

  // your logic here

  return NextResponse.json({ result: 'ok' }, { status: 201 })
}
```
