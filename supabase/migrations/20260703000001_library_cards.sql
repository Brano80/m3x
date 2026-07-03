-- ============================================================================
-- Ship 1 / Step 1 — library schema + cards table (card schema v0.2)
-- ADDITIVE ONLY. Prod is the only database. Migration discipline starts here.
--
-- Design: hot/filterable fields as columns; nested v0.2 blocks (credentials,
-- claims, pricing, endpoints, callable, identity, trust, meta) as jsonb.
-- The API layer reassembles the canonical card JSON from both.
-- Privacy: the library NEVER reads intents/agents/matches/handshakes
-- (HANDOVER §8.3) — this schema is fully separate from the private pool.
-- ============================================================================

create schema if not exists library;

create table if not exists library.cards (
  id              uuid primary key default gen_random_uuid(),

  -- identity / addressing (card schema v0.2 [ID])
  schema_version  text not null default '0.2',
  type            text not null check (type in ('business','agent','tool')),
  urn             text not null unique,          -- urn:air:<domain>:<type>:<slug> — dedupe key, fixed forever
  domain          text not null,
  slug            text not null,
  name            text not null,
  one_liner       text,

  -- match / facet fields ([MATCH][FACET] — columns so they can hard-filter)
  category        text,
  capabilities    text[] not null default '{}',
  serves_markets  text[] not null default '{}',
  customer_types  text[] not null default '{}',
  entity_size     text,
  industries      text[] not null default '{}',
  integrations    text[] not null default '{}',
  languages       text[] not null default '{}',

  -- nested v0.2 blocks (canonical shape preserved)
  credentials     jsonb not null default '[]'::jsonb,
  pricing         jsonb,
  claims          jsonb not null default '[]'::jsonb,
  endpoints       jsonb,
  callable        jsonb,                         -- null until rung 3 (forward-compatible)
  identity        jsonb,
  trust           jsonb not null default jsonb_build_object(
                    'tier', 0,
                    'domain_controlled', false,
                    'claims_corroborated', '0/0',
                    'credentials_confirmed', '0/0',
                    'identity_proofed', false,
                    'signed', false,
                    'evidence_score', 0,
                    'reputation_score', 'unrated',
                    'trust_score', 0,
                    'basis_string', 'Unclaimed — nothing verified yet',
                    'last_verified', null
                  ),
  meta            jsonb not null default '{}'::jsonb,

  -- scalar projections for filtering/sorting (kept in sync by app code)
  trust_score     integer not null default 0,    -- mirrors trust->trust_score
  status          text not null default 'unclaimed'
                    check (status in ('unclaimed','claimed','verified')),  -- mirrors meta->status
  source          text,                          -- mirrors meta->source

  -- search
  search_doc      text,                          -- concatenated text that was embedded
  embedding       vector(1024),                  -- multilingual-e5-large, 'passage: ' prefix

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table library.cards enable row level security;
-- No policies: anon/authenticated get zero rows by design (same posture as the
-- rest of the DB since the 2026-04-18 security pass). API routes use service role.

create index if not exists cards_type_idx     on library.cards (type);
create index if not exists cards_category_idx on library.cards (category);
create index if not exists cards_status_idx   on library.cards (status);
create index if not exists cards_domain_idx   on library.cards (domain);
create index if not exists cards_trust_idx    on library.cards (trust_score desc);
-- No vector index yet: at current scale (~150 cards) a sequential scan is faster
-- and ivfflat needs training data. Add ivfflat/hnsw when cards > ~10k.

comment on table library.cards is
  'Card schema v0.2 (business|agent|tool). Canonical library store — see hq/business-card-schema.md. Additive-only.';

-- ============================================================================
-- Search RPC — mirrors tool_radar_search pattern (the one the API already uses).
-- Returns public card fields only. Optional type filter. verified_only gate.
-- ============================================================================

create or replace function public.library_search_cards(
  query_embedding vector,
  card_type       text default null,
  verified_only   boolean default false,
  match_count     integer default 20
)
returns table (
  urn             text,
  type            text,
  domain          text,
  name            text,
  one_liner       text,
  category        text,
  capabilities    text[],
  serves_markets  text[],
  credentials     jsonb,
  trust           jsonb,
  trust_score     integer,
  status          text,
  callable        jsonb,
  similarity      double precision
)
language plpgsql
stable
as $$
begin
  return query
  select
    c.urn, c.type, c.domain, c.name, c.one_liner, c.category,
    c.capabilities, c.serves_markets, c.credentials, c.trust,
    c.trust_score, c.status, c.callable,
    (1 - (c.embedding <=> query_embedding))::double precision as similarity
  from library.cards c
  where c.embedding is not null
    and (card_type is null or c.type = card_type)
    and (not verified_only or c.status = 'verified')
  order by c.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Browse listing without a query (no embedding) — newest/most-trusted first.
create or replace function public.library_list_cards(
  card_type     text default null,
  verified_only boolean default false,
  list_limit    integer default 50,
  list_offset   integer default 0
)
returns table (
  urn             text,
  type            text,
  domain          text,
  name            text,
  one_liner       text,
  category        text,
  capabilities    text[],
  serves_markets  text[],
  credentials     jsonb,
  trust           jsonb,
  trust_score     integer,
  status          text,
  callable        jsonb,
  total_count     bigint
)
language plpgsql
stable
as $$
begin
  return query
  select
    c.urn, c.type, c.domain, c.name, c.one_liner, c.category,
    c.capabilities, c.serves_markets, c.credentials, c.trust,
    c.trust_score, c.status, c.callable,
    count(*) over ()::bigint as total_count
  from library.cards c
  where (card_type is null or c.type = card_type)
    and (not verified_only or c.status = 'verified')
  order by c.trust_score desc, c.created_at desc
  limit list_limit offset list_offset;
end;
$$;
