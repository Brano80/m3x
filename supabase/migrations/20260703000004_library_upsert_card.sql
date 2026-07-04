-- Controlled write path for the card generator (Windows script, service key).
-- SECURITY DEFINER; EXECUTE granted to service_role ONLY -- anon/authenticated
-- cannot call this. Library schema stays locked for reads AND writes.
-- Guardrail: full upsert never overwrites a claimed/verified card.
-- Applied to prod via Supabase MCP 2026-07-03.

create or replace function public.library_upsert_card(
  p_card jsonb,
  p_embedding text default null,
  p_mode text default 'full'
) returns text
language plpgsql
security definer
set search_path = public, library
as $fn$
declare
  v_urn text := p_card->>'urn';
begin
  if v_urn is null or v_urn !~ '^urn:air:[a-z0-9.-]{1,128}:(business|agent|tool):[a-z0-9-]{1,128}$' then
    raise exception 'INVALID_URN';
  end if;

  if p_mode = 'embed_only' then
    update library.cards
       set embedding  = p_embedding::vector,
           search_doc = coalesce(p_card->>'search_doc', search_doc),
           updated_at = now()
     where urn = v_urn;
    if not found then return 'missing:' || v_urn; end if;
    return 'embedded:' || v_urn;
  end if;

  insert into library.cards (
    schema_version, type, urn, domain, slug, name, one_liner, category,
    capabilities, serves_markets, customer_types, entity_size, industries,
    integrations, languages, credentials, pricing, claims, endpoints, callable,
    identity, trust, meta, trust_score, status, source, search_doc, embedding
  ) values (
    coalesce(p_card->>'schema_version','0.2'),
    p_card->>'type',
    v_urn,
    p_card->>'domain',
    p_card->>'slug',
    p_card->>'name',
    p_card->>'one_liner',
    p_card->>'category',
    coalesce(array(select jsonb_array_elements_text(p_card->'capabilities')), '{}'),
    coalesce(array(select jsonb_array_elements_text(p_card->'serves_markets')), '{}'),
    coalesce(array(select jsonb_array_elements_text(p_card->'customer_types')), '{}'),
    p_card->>'entity_size',
    coalesce(array(select jsonb_array_elements_text(p_card->'industries')), '{}'),
    coalesce(array(select jsonb_array_elements_text(p_card->'integrations')), '{}'),
    coalesce(array(select jsonb_array_elements_text(p_card->'languages')), '{}'),
    coalesce(p_card->'credentials','[]'::jsonb),
    p_card->'pricing',
    coalesce(p_card->'claims','[]'::jsonb),
    coalesce(p_card->'endpoints','{}'::jsonb),
    p_card->'callable',
    coalesce(p_card->'identity','{}'::jsonb),
    coalesce(p_card->'trust','{}'::jsonb),
    coalesce(p_card->'meta','{}'::jsonb),
    coalesce((p_card->>'trust_score')::int, 0),
    coalesce(p_card->>'status','unclaimed'),
    p_card->>'source',
    p_card->>'search_doc',
    p_embedding::vector
  )
  on conflict (urn) do update set
    name           = excluded.name,
    one_liner      = excluded.one_liner,
    category       = excluded.category,
    capabilities   = excluded.capabilities,
    serves_markets = excluded.serves_markets,
    industries     = excluded.industries,
    integrations   = excluded.integrations,
    languages      = excluded.languages,
    credentials    = excluded.credentials,
    claims         = excluded.claims,
    endpoints      = excluded.endpoints,
    trust          = excluded.trust,
    meta           = excluded.meta,
    trust_score    = excluded.trust_score,
    search_doc     = excluded.search_doc,
    embedding      = coalesce(excluded.embedding, library.cards.embedding),
    updated_at     = now()
  where library.cards.status = 'unclaimed';

  return 'upserted:' || v_urn;
end;
$fn$;

revoke all on function public.library_upsert_card(jsonb, text, text) from public;
revoke all on function public.library_upsert_card(jsonb, text, text) from anon;
revoke all on function public.library_upsert_card(jsonb, text, text) from authenticated;
grant execute on function public.library_upsert_card(jsonb, text, text) to service_role;
