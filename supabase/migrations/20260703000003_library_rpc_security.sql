-- ============================================================================
-- Ship 1 / fix — library reads via SECURITY DEFINER functions in public schema.
-- Why: the `library` schema is not granted to the API roles (by design — keeps
-- it locked). SECURITY INVOKER RPCs therefore hit "permission denied for schema
-- library". Making the read functions SECURITY DEFINER (owner = postgres) lets
-- them read library.cards while the schema itself stays fully unexposed — only
-- these three controlled functions can read cards. Matches the privacy posture.
-- Also adds library_get_card so the card API + detail page never touch the
-- table directly (no need to expose the library schema to PostgREST).
-- ============================================================================

create or replace function public.library_search_cards(
  query_embedding vector,
  card_type       text default null,
  verified_only   boolean default false,
  match_count     integer default 20
)
returns table (
  urn text, type text, domain text, name text, one_liner text, category text,
  capabilities text[], serves_markets text[], credentials jsonb, trust jsonb,
  trust_score integer, status text, callable jsonb, similarity double precision
)
language plpgsql stable security definer
set search_path = public, library
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

create or replace function public.library_list_cards(
  card_type     text default null,
  verified_only boolean default false,
  list_limit    integer default 50,
  list_offset   integer default 0
)
returns table (
  urn text, type text, domain text, name text, one_liner text, category text,
  capabilities text[], serves_markets text[], credentials jsonb, trust jsonb,
  trust_score integer, status text, callable jsonb, total_count bigint
)
language plpgsql stable security definer
set search_path = public, library
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

-- Single card by URN → full canonical card JSON (v0.2). SECURITY DEFINER.
create or replace function public.library_get_card(p_urn text)
returns jsonb
language sql stable security definer
set search_path = public, library
as $$
  select jsonb_build_object(
    'schema_version', c.schema_version, 'type', c.type, 'urn', c.urn, 'domain', c.domain,
    'name', c.name, 'one_liner', c.one_liner, 'category', c.category,
    'capabilities', to_jsonb(c.capabilities), 'serves_markets', to_jsonb(c.serves_markets),
    'customer_types', to_jsonb(c.customer_types), 'entity_size', c.entity_size,
    'industries', to_jsonb(c.industries), 'integrations', to_jsonb(c.integrations),
    'languages', to_jsonb(c.languages), 'credentials', c.credentials, 'pricing', c.pricing,
    'claims', c.claims, 'endpoints', c.endpoints, 'callable', c.callable, 'identity', c.identity,
    'trust', c.trust, 'meta', c.meta, 'status', c.status, 'trust_score', c.trust_score
  )
  from library.cards c
  where c.urn = p_urn;
$$;

grant execute on function public.library_search_cards(vector, text, boolean, integer) to anon, authenticated, service_role;
grant execute on function public.library_list_cards(text, boolean, integer, integer) to anon, authenticated, service_role;
grant execute on function public.library_get_card(text) to anon, authenticated, service_role;
