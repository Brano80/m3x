---
tags: [#project, #M3X, #ToolRadar, #ARD, #build-plan]
created:: 2026-06-28
status:: 📋 Ready to build
scope:: CLEAN READ — ARD advertises M3X-the-network + ToolRadar-the-library. Never individual agents or intents.
depends_on:: ARD-verification-2026-06-28.md (canonical field reference)
---
# ARD Build Plan — M3X + ToolRadar Discoverability

## Scope decision (locked)
ARD makes two things discoverable by external agents (GitHub Agent Finder, HF Discover, any ARD client):
1. **M3X-the-network** — "here is a private matching network; connect via this MCP server to join." A handful of static entries pointing at surfaces that already exist.
2. **ToolRadar-the-library** — real semantic search over the curated tool catalog, each result stamped with curation/trust metadata.

**Hard privacy constraint (non-negotiable):** the ARD manifest and the ARD `/search` endpoint MUST NEVER read the `intents`, `agents`, `matches`, or `handshakes` tables. They read only the `tool_radar` data and static network config. No individual M3X agent, intent, or capability is ever advertised or returned. This keeps the dark pool dark and is a verification gate (test V4).

---

## What already exists (reuse, don't rebuild)
| Asset | Path | Role in ARD |
|---|---|---|
| Manifest route (NON-conformant) | `app/.well-known/ai-catalog.json/route.ts` | **Rewrite** to ARD v0.9 shape |
| M3X MCP card | `app/.well-known/mcp/server-card.json/route.ts`, `mcp.json` | Referenced as an entry (`application/mcp-server-card+json`) |
| M3X A2A card | `app/.well-known/agent.json/route.ts` | Referenced as an entry (`application/a2a-agent-card+json`) |
| DID document | `app/.well-known/did.json/route.ts` | `host.identifier = did:web:m3x.space` + trust identity |
| ToolRadar search engine | `app/api/tool-radar/search/route.ts` (HF embed → `tool_radar_search` RPC) | Wrapped by ARD `/search` |
| Embeddings + DB | `lib/embed.ts`, `lib/supabase.ts` | Reused by ARD search |
| Signing/identity | `lib/did.ts`, `lib/crypto.ts`, env `M3X_PUBLIC_KEY_MULTIBASE` | Trust manifest JWS |
| MCP server package | `mcp/` (`m3x-mcp-server` on npm), `mcp/src/index.ts` | Pattern to mirror for ToolRadar MCP |
| Conventions | `.claude/rules/*` | Error shape, auth, SSRF, privacy |

---

## Build order

### P0-A — Rewrite the manifest to conformant ARD v0.9
**File:** `app/.well-known/ai-catalog.json/route.ts` (replace body)
The current output (`$schema: agent-card.ai…`, `name/description/services[]`) is not ARD. Replace with the ai-catalog shape (validated field names in `ARD-verification-2026-06-28.md`).

Target output:
```jsonc
{
  "specVersion": "1.0",
  "host": {
    "displayName": "M3X",
    "identifier": "did:web:m3x.space",
    "documentationUrl": "https://m3x.space",
    "trustManifest": { /* P1-B */ }
  },
  "entries": [
    {
      "identifier": "urn:ai:m3x.space:registry:discovery",
      "displayName": "M3X + ToolRadar Discovery Registry",
      "type": "application/ai-registry+json",
      "url": "https://m3x.space/api/ard",              // clients append /search
      "description": "Natural-language search over the ToolRadar curated tool library and M3X network surfaces.",
      "tags": ["registry","search","curated"],
      "representativeQueries": [
        "find a vetted MCP server for web scraping",
        "what tool helps me extract tables from PDFs"
      ]
    },
    {
      "identifier": "urn:ai:m3x.space:server:m3x-mcp",
      "displayName": "M3X MCP Server",
      "type": "application/mcp-server-card+json",
      "url": "https://m3x.space/.well-known/mcp/server-card.json",
      "description": "Connect an agent to the M3X private matching network — post intents, get matches, run handshakes.",
      "capabilities": ["intent-matching","agent-handshake","trust-score"],
      "representativeQueries": [
        "match my startup with a pre-seed investor privately",
        "find a B2B procurement counterparty without posting publicly"
      ]
    },
    {
      "identifier": "urn:ai:m3x.space:agent:m3x-network",
      "displayName": "M3X A2A Agent",
      "type": "application/a2a-agent-card+json",
      "url": "https://m3x.space/.well-known/agent.json",
      "description": "Google A2A endpoint for delegating matching tasks to the M3X network."
    },
    {
      "identifier": "urn:ai:m3x.space:server:tool-radar",
      "displayName": "ToolRadar MCP Server",
      "type": "application/mcp-server-card+json",
      "url": "https://m3x.space/.well-known/tool-radar/server-card.json", // P0-B
      "description": "Curated, human-vetted tool/MCP discovery. Search a trust-scored shortlist, not a scrape-everything index.",
      "capabilities": ["tool-search","curated-recommendations"],
      "representativeQueries": [
        "recommend a vetted tool for sending transactional email",
        "is there a trusted MCP for Postgres access"
      ]
    }
  ]
}
```
Notes:
- `specVersion` is `"1.0"` (the manifest version), not the spec's `"0.9"`.
- All identifiers are domain-anchored under `m3x.space` — required by the schema regex and the trust-binding rule.
- Keep the old custom catalog only if something consumes it; if so, move it to `/.well-known/ai-services.json`. Otherwise drop it. **Decision D1.**
- Headers: keep `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=3600`.

### P0-B — ToolRadar MCP server (the one genuinely new build)
Today ToolRadar is reachable only through the Claude hook/skill. Expose one MCP tool — `tool_radar_search(query, limit)` — so any MCP client can call it.

**Recommended approach (Decision D2):** add a remote MCP route `app/api/tool-radar/mcp/route.ts` mirroring `app/api/mcp/route.ts`, backed by the existing `tool_radar_search` RPC, plus a discovery card at `app/.well-known/tool-radar/server-card.json/route.ts`.
- Alt A: add the `tool_radar_search` tool to the existing `m3x-mcp-server` package. Faster, but couples ToolRadar to M3X's server and muddies the "ToolRadar is its own thing" story.
- Alt B: standalone npm package `tool-radar-mcp`. Cleanest separation, most overhead.
- → Recommend the remote route now (low overhead, independently discoverable); ship a standalone package later if ToolRadar earns its own distribution.
- Tool output: each tool stamped with curation metadata `{ human_vetted, vetted_date, curator }`.
- **Keep the existing Claude hook + skill working** — this is additive.

### P1-A — ARD registry: `POST /api/ard/search`
**File:** `app/api/ard/search/route.ts` (new). Public, unauthenticated (discovery must be open), rate-limited (reuse the in-memory IP pattern from `register/route.ts`).

Accept the ARD request envelope:
```jsonc
{ "query": { "text": "...", "filter": { "type": ["..."] } },
  "federation": "none", "pageSize": 10, "pageToken": "..." }
```
Logic:
1. Validate `query.text` present (400 `INVALID_ARGUMENT` per ARD Appendix B if missing).
2. Run ToolRadar semantic search: reuse `embedQuery(text)` → `tool_radar_search` RPC (cap `pageSize` ≤ 100, default 10).
3. Map each tool row → ARD result entry:
   ```jsonc
   {
     "identifier": "urn:ai:m3x.space:tool:<slug>",
     "displayName": "<tool name>",
     "type": "application/mcp-server-card+json",   // or application/ai-skill per tool kind
     "url": "<tool url>",
     "score": <round(0..100 from cosine similarity)>,   // RELEVANCE ONLY
     "source": "https://m3x.space/api/ard",
     "metadata": { "human_vetted": true, "vetted_date": "<iso>", "curator": "<name>" }
   }
   ```
4. Optionally prepend the static network entries (M3X MCP, ToolRadar) when the query is about matching/networking rather than tools.
5. `federation`: implement `none` (self only) and `referrals` (self + referral entries to public registries like HF Discover). `auto` optional/later.
6. Return `{ results, referrals?, pageToken? }`.

Critical rules:
- `score` is semantic relevance only. **Never** put M3X trust or ToolRadar vetting in `score` — spec §7.2 forbids it. Vetting goes in `metadata` (see P1-B).
- This route imports nothing that touches `intents`/`agents`/`matches`/`handshakes`. Enforce by code review + test V4.
- Error shape: ARD uses its own codes (Appendix B: `INVALID_ARGUMENT`, `RATE_LIMIT_EXCEEDED`, …). Keep these for ARD routes; M3X's `{error:{message,code}}` stays on M3X routes.
- `POST /api/ard/explore` → return `501 Not Implemented` (spec-compliant). `GET /api/ard/agents` → skip or 501.

### P1-B — Trust manifest (the differentiator)
Add a populated, signed `trustManifest` to `host` and to the M3X/ToolRadar entries. Schema-exact shape (note: each attestation needs `mediaType` — the prose table omits it but the JSON Schema requires it):
```jsonc
{
  "identity": "did:web:m3x.space",
  "identityType": "did",
  "attestations": [
    { "type": "GDPR", "uri": "https://m3x.space/compliance/gdpr",
      "mediaType": "text/html" },
    { "type": "curation-policy", "uri": "https://m3x.space/toolradar/curation",
      "mediaType": "text/html" }
  ],
  "signature": "<detached JWS over the trustManifest>"
}
```
- Sign with the network key already referenced by `M3X_PUBLIC_KEY_MULTIBASE` / `lib/did.ts`. Put the helper in a new `lib/ard.ts` (builds entries, maps tool rows, signs manifest).
- ToolRadar per-tool vetting stays in entry `metadata` (`human_vetted`/`vetted_date`/`curator`) — scalars only, schema-legal.
- The URN publisher domain (`m3x.space`) must match `trustManifest.identity` domain — already aligned.
- **Decision D3:** confirm a signing private key is available server-side (env). If not, ship attestations now and add `signature` once the key is provisioned — attestations alone already beat the "controls the domain" baseline.

### P2 — Defer
- CSA Agent Registry + IETF `draft-cui-dmsc-agent-cdi` serializers (one source → three schemas). Build only after ARD path is proven and federating.
- Path-nested registry `/registries/toolradar/search` — non-canonical hf-discover sugar; skip under the clean read (single `/search` suffices).
- `auto` federation.

---

## Definition of done (verification)
| # | Test | How |
|---|---|---|
| V1 | Manifest validates against schema | `npx ajv-cli validate -s ai-catalog.schema.json -d <manifest>` |
| V2 | Manifest passes ARD conformance | `conformance-test manifest https://m3x.space/.well-known/ai-catalog.json` (CLI in ards-project/ard-spec) |
| V3 | Registry passes ARD conformance | `conformance-test registry https://m3x.space/api/ard` |
| V4 | **Privacy:** ARD search never touches private tables | Code review + test asserting `/api/ard/search` returns 0 results that reference `agents`/`intents`; grep imports |
| V5 | External client finds you | Point GitHub Agent Finder + hf-discover at `m3x.space`; confirm entries returned for a relevant NL query |
| V6 | ToolRadar MCP callable from generic client | `curl`/MCP inspector against the new ToolRadar MCP route, not the Claude plugin |
| V7 | Trust manifest signature verifies | Verify detached JWS against the published DID key |

---

## Decisions needed before coding
- **D1** — Keep the legacy `ai-catalog.json` content at `/.well-known/ai-services.json`, or drop it? (Recommend: drop unless a known consumer exists.)
- **D2** — ToolRadar MCP as a remote route (`/api/tool-radar/mcp`, recommended), a tool added to `m3x-mcp-server`, or a standalone npm package?
- **D3** — Is a server-side signing key available now for the trust-manifest JWS, or ship attestations-first and sign in a follow-up?

## Estimated effort (rough)
- P0-A manifest rewrite: ~half day. P0-B ToolRadar MCP + card: ~1 day. P1-A ARD `/search`: ~1 day. P1-B trust manifest + `lib/ard.ts`: ~1 day. Verification: ~half day. **~4 days** for a conformant, crawlable, trust-stamped M3X + ToolRadar.
