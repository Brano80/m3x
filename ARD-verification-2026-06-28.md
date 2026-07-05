---
tags: [#project, #M3X, #ToolRadar, #ARD, #verification]
created:: 2026-06-28
status:: ✅ Verified against canonical sources
supersedes_fields_in:: Build Brief — Make M3X + ToolRadar ARD-Discoverable
---
# ARD Verification — Brief vs. Canonical Spec (2026-06-28)

Purpose: before building, confirm every load-bearing claim in the build brief against live primary sources, and capture the **real** field names so nothing gets hardcoded from the brief's approximations. All URLs below fetched and read 2026-06-28.

## Verdict

**ARD is real and the strategy is sound — build it.** All three named repos resolve, the spec is genuine (v0.9 draft), and the trust/curation wedge is validated by the spec's own text. But the brief's JSON shapes are wrong or incomplete in ways that would fail conformance, and one strategic instruction (trust score in search results) directly conflicts with the spec. Corrections below are mandatory before P0.

---

## What's CONFIRMED

| Brief claim | Status | Evidence |
|---|---|---|
| ARD v0.9 draft, dated 28 May 2026 | ✅ | `spec/ard.md` header: "Version v0.9 (Draft), Date May 28, 2026" |
| Apache-2.0 | ✅ | `ards-project/ard-spec` LICENSE = Apache-2.0 |
| Publicly launched ~17 Jun 2026 | ✅ | GitHub changelog 2026-06-17; Microsoft "Command Line" blog; multiple outlets |
| Publish `/.well-known/ai-catalog.json`; registries crawl it; `POST /search` answers NL queries | ✅ | spec §4.1, §6.1, §7.2 |
| Sits above MCP/A2A/Skills (discovery before invocation) | ✅ | spec §1, §3.1 |
| GitHub Agent Finder is a live client (17 Jun) | ✅ | github.blog changelog; "implements the open ARD specification" |
| hf-discover is the HF reference implementation | ✅ | `huggingface/hf-discover`, latest release v1.3.3 (15 Jun 2026) |
| Attestation is OPTIONAL in ARD → the trust gap | ✅ | spec §5.1: `trustManifest` optional; only `identity` required when present |
| Adoption is near-zero / very early | ✅ (directionally) | Spec ~11 days old; ard-spec has 3 stars, hf-discover 5. See "unverified" for the exact census number. |

---

## What's WRONG or DRIFTED in the brief (fix before building)

### 1. Authorship: NOT "Google + Linux Foundation"
ARD is authored by **Google (Junjie Bu), Microsoft (R.V. Guha), Hugging Face (Shaun Smith)**, with named contributors from AWS, Cisco, GitHub, GoDaddy, Nvidia, Salesforce, Snowflake, Databricks. Press frames it as ~11 companies.
The Linux Foundation link is real but indirect: ARD builds on the **`Agent-Card/ai-catalog`** standard, whose repo states it is *"a temporary working repo maintained by the Linux Foundation."* So: **Google/Microsoft/HF-led, built on a Linux-Foundation-stewarded base standard.** Don't cite "Google + Linux Foundation" as the authors.

### 2. The manifest shape in the brief is incomplete — it would fail schema validation
Brief showed `{ "entries": [ { "type", "identifier", "url" } ] }`. The canonical JSON Schema (`spec/schemas/ai-catalog.schema.json`) **requires** `specVersion` + `entries` at the top level, and each entry **requires** `identifier`, `displayName`, `type`, plus **exactly one** of `url`/`data`.

Key constraints the brief omitted:
- `specVersion` is the **manifest** version — enum strictly **`"1.0"`** (NOT `"0.9"`; the spec is v0.9 but the manifest field is `"1.0"`). Easy to get wrong.
- `host` object (optional but `additionalProperties:false`); if present, `host.displayName` required.
- Top-level `additionalProperties:false` — no stray keys allowed.
- `identifier` MUST match `^urn:ai:[a-zA-Z0-9.-]+(:[a-zA-Z0-9._-]+)+$` → domain-anchored: `urn:ai:m3x.space:...`, not a bare `urn:...`.
- `representativeQueries`: **2–5 items, enforced** (minItems 2, maxItems 5). These drive search ranking — not optional in practice.
- `metadata` values are **scalars only** (string/number/boolean/null) — you cannot nest an object in `metadata`.

### 3. Media type drift: `application/mcp-server+json` vs `application/mcp-server-card+json`
- Spec **prose** (`ard.md`) uses `application/mcp-server+json` and `application/a2a-agent-card+json`.
- Spec **JSON Schema** description example uses `application/mcp-server-card+json` (with `-card`).
- hf-discover treats **`application/mcp-server-card+json`** as canonical and `application/mcp-server+json` as a **deprecated transition alias**.
→ The `-card` form is winning. **Pin to the conformance tool + schema, emit `application/mcp-server-card+json`, accept the alias.** Do not hardcode from the brief. Confirmed valid types seen: `application/a2a-agent-card+json`, `application/mcp-server-card+json` (alias `+json` without `-card`), `application/ai-catalog+json`, `application/ai-registry+json`, `application/ai-skill` (and `application/ai-skill+md`).

### 4. ⚠️ STRATEGIC: "Surface trust score as a first-class field in search results" conflicts with the spec
Spec §7.2 is explicit: the result `score` is **semantic relevance only (0–100)** and *"MUST NOT be interpreted by orchestrators as a cryptographic trust, compliance, or safety rating. Trust evaluation is fully decoupled and handled independently via the trustManifest layer."*
→ M3X **cannot** put its trust score in the ARD `score` field. Correct implementation:
- Put M3X trust in **`metadata.m3xTrustScore`** (a number — scalar, schema-legal) and/or as an **attestation** in the entry's `trustManifest`.
- Keep `score` for relevance.
The brief's *thesis* still holds (ARD deliberately leaves trust to the trustManifest layer = the gap), but the *mechanism* is trustManifest/metadata, not the ranking score. This is the single most important correction.

### 5. "Expose as ARD nested registry: `POST /registries/toolradar/search`" is an hf-discover convention, not the spec
The spec mandates only **`POST /search`** (plus optional `POST /explore` and `GET /agents`). The `/registries/<name>/search` path is hf-discover-specific sugar (`/registries/huggingface/spaces/search`). The spec's actual nesting mechanism is: advertise an `application/ai-registry+json` entry in the manifest and support **federation** (`auto` | `referrals` | `none`). Build `POST /search` + federation first; the path-nested form is optional.

### 6. Attestation schema requires `mediaType` (prose table omits it)
The prose §5.2 lists attestation as `{type, uri, digest?}`. The **JSON Schema requires `type`, `uri`, AND `mediaType`** per attestation. To pass validation, include e.g. `"mediaType": "application/pdf"`. The schema also adds a `trustSchema` object not in the prose table. **Trust the schema file over the prose tables.**

---

## UNVERIFIED

- **"0 of 39 major sites serving a catalog (census 18 Jun 2026)"** — could not confirm the specific figure; not surfaced in search. The *direction* (adoption ≈ zero) is well supported by the 17 Jun launch date and low repo engagement, but **do not cite the exact 0/39 number** without the source. The brief's `[[Agent-Registry-Standards-2026]]` note is cited as its origin — check there.

---

## Canonical field reference (use these, not the brief)

### Manifest `/.well-known/ai-catalog.json`
```jsonc
{
  "specVersion": "1.0",                          // enum ["1.0"], required
  "host": {                                      // optional; additionalProperties:false
    "displayName": "M3X",                        // required if host present
    "identifier": "did:web:m3x.space"            // optional
  },
  "entries": [ /* CatalogEntry[] */ ]            // required
}
```

### CatalogEntry
```jsonc
{
  "identifier": "urn:ai:m3x.space:registry:agents", // required, ^urn:ai:<fqdn>:...$
  "displayName": "M3X Agent Registry",              // required
  "type": "application/ai-registry+json",           // required, IANA media type
  "url": "https://m3x.space/api/ard",               // EXACTLY ONE of url|data
  // "data": { ... },                               // inline alternative
  "description": "…",                               // optional
  "tags": ["matching","private-pool"],              // optional
  "capabilities": ["intent-matching"],              // optional, fast-filter tags
  "representativeQueries": [                         // optional but 2–5 if present
    "find me a pre-seed investor for an AI infra startup",
    "match my SaaS with an enterprise procurement buyer"
  ],
  "version": "1.0.0",                               // optional
  "updatedAt": "2026-06-28T00:00:00Z",             // optional ISO 8601
  "metadata": { "m3xTrustScore": 82 },             // scalars only
  "trustManifest": { /* see below */ }             // optional — OUR WEDGE
}
```

### trustManifest (the differentiator — ship it populated + signed)
```jsonc
{
  "identity": "did:web:m3x.space",                 // required
  "identityType": "did",                           // spiffe|did|https|other
  "attestations": [
    {
      "type": "GDPR",                              // required
      "uri": "https://m3x.space/compliance/gdpr",  // required
      "mediaType": "text/html",                    // REQUIRED by schema
      "digest": "sha256-…"                         // optional
    }
  ],
  "provenance": [ { "relation": "publishedFrom", "sourceId": "urn:ai:m3x.space:…" } ],
  "signature": "<detached JWS over trustManifest>" // optional but = the point
}
```
Binding rule (spec §4.2.1 + §5.1): the `<publisher>` domain in every `identifier` URN MUST align with `trustManifest.identity`'s domain. So M3X agents are sub-identities of `m3x.space` (`urn:ai:m3x.space:agent:<handle>`), and the trust identity must be `m3x.space`.

### POST /search — request
```jsonc
{
  "query": {
    "text": "find me a flight booking agent",      // required for /search
    "filter": {                                     // optional; dot-path keys
      "type": ["application/a2a-agent-card+json"],
      "tags": ["finance"],
      "trustManifest.attestations.type": ["SOC2-Type2"]
    }
  },
  "federation": "referrals",                        // auto(default)|referrals|none
  "pageSize": 5,                                    // root-level, default 10 max 100
  "pageToken": "…"
}
```

### POST /search — response
```jsonc
{
  "results": [
    {
      "identifier": "urn:ai:m3x.space:agent:brano.startup",
      "displayName": "Brano's Startup Agent",
      "type": "application/a2a-agent-card+json",
      "url": "https://m3x.space/api/a2a/brano.startup",
      "score": 95,                                  // RELEVANCE only, not trust
      "source": "https://m3x.space/api/ard",
      "metadata": { "m3xTrustScore": 82 }           // trust goes HERE
    }
  ],
  "referrals": [ /* application/ai-registry entries */ ],
  "pageToken": "…"
}
```
Errors (Appendix B): 400 INVALID_ARGUMENT, 401 UNAUTHENTICATED, 404 NOT_FOUND, 429 RATE_LIMIT_EXCEEDED, 500 INTERNAL_ERROR.

Discovery hooks (spec §6.1): well-known URI (primary), `robots.txt` `Agentmap:` directive, `<link rel="ai-catalog">`, DNS service-binding records. Registry base URL is found by locating the `application/ai-registry+json` entry; clients append `/search`.

Conformance: official Python CLI in repo — `./conformance/bin/conformance-test manifest <url>` and `... registry <baseurl>`. **Run this against m3x.space before claiming conformance** (acceptance test #1 in the brief).

---

## Net effect on the build order
P0/P1 sequencing in the brief is fine. The corrections change *content*, not order:
1. Build manifests with the full required shape (§2 above), not the brief's stub.
2. Pin media types to the schema/conformance tool, not the brief.
3. Implement trust as `trustManifest` + `metadata.m3xTrustScore` — **never** the `score` field.
4. `POST /search` + federation is the spec floor; `/registries/x/search` path-nesting is optional.
5. Attestations must carry `mediaType`.
6. Validate with the official conformance CLI as the definition of done.

## Sources (fetched 2026-06-28)
- Canonical spec: https://raw.githubusercontent.com/ards-project/ard-spec/main/spec/ard.md
- Manifest JSON Schema: https://raw.githubusercontent.com/ards-project/ard-spec/main/spec/schemas/ai-catalog.schema.json
- ard-spec repo: https://github.com/ards-project/ard-spec
- ai-catalog base standard (LF-stewarded): https://github.com/Agent-Card/ai-catalog
- hf-discover reference impl: https://github.com/huggingface/hf-discover
- Agent Finder launch: https://github.blog/changelog/2026-06-17-agent-finder-for-github-copilot-now-available/
- Microsoft ARD announcement: https://commandline.microsoft.com/agentic-resource-discovery-specification-ard/
