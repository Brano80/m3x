-- ============================================================================
-- Ship 1 / Step 2 — migrate tool_radar.tool_cards → library.cards (type: tool)
-- IDEMPOTENT: upsert keyed on urn; safe to re-run. tool_radar tables stay live
-- in parallel (existing /api/tool-radar/* and the npm MCP tool keep serving
-- from them until cutover).
--
-- Notes:
-- - Excludes source='cowork-internal' (13 rows) — mirrors the existing
--   tool_radar_search RPC, which already hides them from the public surface.
-- - Embedding copied natively in-database (same model, same 1024d, same
--   search_doc text) — avoids the pgvector-over-REST fragility.
-- - problem_solved becomes a registry-guessed, unconfirmed claim (v0.2 shape).
-- - meta.source = 'crawl:tool-radar' (tool_radar is our curated pipeline, not
--   a card-native registry, so 'federation:' is not used — NS §4A ruling).
-- ============================================================================

with src as (
  select
    tc.*,
    regexp_replace(regexp_replace(lower(tc.name), '[^a-z0-9]+', '-', 'g'), '(^-|-$)', '', 'g') as base_slug,
    coalesce(
      nullif(split_part(split_part(tc.github_url, '//', 2), '/', 1), ''),
      'github.com'
    ) as tool_domain
  from tool_radar.tool_cards tc
  where tc.source is distinct from 'cowork-internal'
),
sluggy as (
  select *,
    case
      when row_number() over (partition by base_slug order by added_at, id) = 1 then base_slug
      else base_slug || '-' || row_number() over (partition by base_slug order by added_at, id)
    end as final_slug
  from src
)
insert into library.cards (
  schema_version, type, urn, domain, slug, name, one_liner,
  category, capabilities, serves_markets,
  credentials, pricing, claims, endpoints, callable, identity, trust, meta,
  trust_score, status, source, search_doc, embedding
)
select
  '0.2',
  'tool',
  'urn:air:' || s.tool_domain || ':tool:' || s.final_slug,
  s.tool_domain,
  s.final_slug,
  s.name,
  coalesce(nullif(s.tagline, ''), left(s.description, 140)),
  'developer-tool',
  coalesce(s.stack_tags, '{}'),
  '{*}',
  '[]'::jsonb,
  null,
  case
    when nullif(s.problem_solved, '') is not null then jsonb_build_array(jsonb_build_object(
      'id', 'c1',
      'text', left(s.problem_solved, 500),
      'evidence_url', s.github_url,
      'provenance', 'registry-guessed',
      'status', 'unconfirmed',
      'checked_against', jsonb_build_array()
    ))
    else '[]'::jsonb
  end,
  jsonb_build_object(
    'website', s.github_url, 'contact', null, 'a2a_card', null, 'mcp', null
  ),
  null,   -- callable: readable rung; GitHub repos are not live endpoints
  jsonb_build_object(
    'registration_id', null, 'jurisdiction', null,
    'socials', case when s.github_url is not null
                    then jsonb_build_array(s.github_url) else jsonb_build_array() end
  ),
  jsonb_build_object(
    'tier', 0, 'domain_controlled', false,
    'claims_corroborated', case when nullif(s.problem_solved,'') is not null then '0/1' else '0/0' end,
    'credentials_confirmed', '0/0',
    'identity_proofed', false, 'signed', false,
    'evidence_score', 0, 'reputation_score', 'unrated', 'trust_score', 0,
    'basis_string', 'Unclaimed · curated via Tool Radar · claims not yet cross-checked',
    'last_verified', null
  ),
  jsonb_build_object(
    'source', 'crawl:tool-radar',
    'status', 'unclaimed',
    'generated_by', 'tool-radar-pipeline',
    'last_updated', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'license', s.license,
    'stars', s.stars,
    'github_url', s.github_url,
    'tool_radar_id', s.id
  ),
  0,
  'unclaimed',
  'crawl:tool-radar',
  s.search_doc,
  s.embedding
from sluggy s
on conflict (urn) do update set
  name           = excluded.name,
  one_liner      = excluded.one_liner,
  capabilities   = excluded.capabilities,
  claims         = excluded.claims,
  endpoints      = excluded.endpoints,
  identity       = excluded.identity,
  meta           = excluded.meta,
  search_doc     = excluded.search_doc,
  embedding      = excluded.embedding,
  updated_at     = now()
-- deliberately NOT updated on re-run: trust, trust_score, status (registry-set;
-- a claimed/verified card must never be reset to unclaimed by a re-migration)
;
