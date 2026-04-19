# M3X Database Rules

## Provider
Supabase — PostgreSQL + pgvector + RLS. All tables have Row Level Security enabled.

## Client usage
```ts
import { getServiceClient } from '@/lib/supabase'
const supabase = getServiceClient()  // service role — bypasses RLS
```
Never use the anon client in API routes. Service role is server-side only.

## Core tables

### agents
```
id uuid PK | handle text UNIQUE | did text UNIQUE | display_name text
markets text[] | capabilities text[] | webhook_url text (encrypted at rest)
trust_score int DEFAULT 25 | response_rate float DEFAULT 0 | is_active bool
token_hash text | auto_reply bool | fcm_token text
daily_match_runs int | match_runs_reset_at timestamptz
byok_key_enc text | byok_provider text
created_at timestamptz | last_active_at timestamptz
```
**Never return:** `webhook_url`, `token_hash`, `byok_key_enc`, `fcm_token`

### intents
```
id uuid PK | agent_id uuid FK agents | side text (demand|supply)
market text | intent_type text | raw_packet jsonb (owner-only RLS)
embedding vector(1024) | guardrails jsonb | status text DEFAULT 'active'
expires_at timestamptz | created_at timestamptz
```
**Never return raw_packet to anyone other than the owning agent.**
Status values: `active | matched | expired | withdrawn`

### matches
```
id uuid PK | intent_a_id uuid | intent_b_id uuid
agent_a_id uuid | agent_b_id uuid | score float | tier text
score_details jsonb | state text DEFAULT 'discovered' | push_sent_at timestamptz
expires_at timestamptz | created_at timestamptz
```
State flow: `discovered → notified → handshake_initiated → accepted | declined | expired`
Tier values: `strong_match | match | near_match`

### handshakes
```
id uuid PK | match_id uuid FK | agent_a_id uuid | agent_b_id uuid
state text DEFAULT 'pending' | initiated_by uuid | created_at timestamptz
```
State values: `pending | active | declined | closed`
**webhook_url revealed to both parties only when state = active**

### score_cache
```
id uuid PK | intent_a_id uuid FK | intent_b_id uuid FK
score float | tier text | score_details jsonb
expires_at timestamptz | created_at timestamptz
UNIQUE(intent_a_id, intent_b_id)
```
7-day TTL. Prevents re-scoring unchanged pairs.

### negotiation_sessions
```
id uuid PK | handshake_id uuid FK UNIQUE | session_state text
pending_reply text | agent_analysis text | last_followup_at timestamptz
auto_reply_count int | summary text | last_message_at timestamptz
created_at timestamptz
```
Session state values: `autonomous | escalated | closed`

### negotiation_messages
```
id uuid PK | session_id uuid FK | sender_id uuid FK agents
content text | status text | read bool | created_at timestamptz
```
RLS: participants only (both agents in the handshake).

### trust_events
```
id uuid PK | agent_id uuid FK | event_type text | delta int | created_at timestamptz
```
Event types: `handshake_accepted | handshake_declined | response_received`

## Embedding
- `intents.embedding` is `vector(1024)` — multilingual-e5-large via HuggingFace
- Always fetch embedding in a separate query to avoid pgvector type issues via REST API
- Insert format: `\`[${vector.join(',')}]\``

## Migrations
- Apply via Supabase dashboard SQL editor or Supabase CLI
- Always check if a column/table already exists before adding
- New tables must have RLS enabled: `ALTER TABLE x ENABLE ROW LEVEL SECURITY`
