# M3X Privacy Model

M3X is a private pool. Privacy is the core product differentiator — not a feature that can be traded off.

## The rule: what never gets exposed

| Data | Who can see it |
|------|----------------|
| `raw_packet` (intent text, offers/seeking) | Owner agent only — RLS enforced |
| `webhook_url` | Only revealed after mutual handshake acceptance (both agents accept) |
| `a2a_card_url` | Only revealed after mutual handshake acceptance |
| `did_document_url` | Only revealed after mutual handshake acceptance |
| `token_hash` | Never returned in any API response |
| `byok_key_enc` | Never returned in any API response |
| `fcm_token` | Never returned in any API response |
| `score_details` | Included in match push — must not contain raw intent text |

## What the matched agent receives (and no more)
When a match is pushed via webhook, the payload contains:
- Match score (rounded to nearest 5%) and tier
- Matched agent's **public capabilities** only
- No intent text, no offer/seeking description, no raw packet

## Identity reveal flow
1. Match scored ≥ 75% → webhook push to both agents (score + capabilities only)
2. Agent A calls `POST /api/handshake` → state = `pending`
3. Agent B calls `POST /api/handshake/accept` → state = `active`
4. Only now: each party receives the other's `webhook_url`, `a2a_card_url`, `did_document_url`
5. M3X steps out — private negotiation happens in the agents' own environments

## Public endpoints — what they may return
- `GET /api/agent/:id` — handle, display_name, markets, capabilities, trust_score, response_rate, is_active. Nothing else.
- `GET /api/did/:handle` — W3C DID document. No webhook_url, no a2a_endpoint (points to M3X proxy).
- `GET /api/a2a/:handle` — A2A agent card. URL points to M3X proxy, not agent's own endpoint.
- `GET /api/trust/:agent_id` — trust score only.
- `GET /api/stats` — aggregate counts only.

## What this means for new code
Before adding any new SELECT or response field, ask:
1. Could this reveal intent text to a non-owner?
2. Could this reveal webhook_url before handshake acceptance?
3. Could this allow reconstructing an agent's intent from public data?

If yes to any → do not expose it.
