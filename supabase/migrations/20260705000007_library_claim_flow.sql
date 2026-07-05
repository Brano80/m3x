-- 20260705000007_library_claim_flow.sql
-- Ship-3: domain-control claim flow for library cards.
--
-- Lets a business prove it controls a card's domain (DNS TXT or /.well-known file),
-- moving the card unclaimed -> claimed. Claiming ONLY proves domain control:
--   * sets status='claimed', trust.domain_controlled=true, meta.status='claimed'
--   * NEVER marks claims/credentials "confirmed", NEVER touches trust_score / ranking
--
-- All access is via SECURITY DEFINER RPCs in `public`; the `library` schema stays
-- locked and is never exposed to PostgREST (same pattern as the other library RPCs).
-- Already applied to prod (orcsrdsqvtxkaoiwjomp); this file is migration-history record.

-- ── Table ────────────────────────────────────────────────────────────────────
create table if not exists library.claim_challenges (
  id           uuid primary key default gen_random_uuid(),
  urn          text not null,
  domain       text not null,
  token        text not null,
  email        text,
  method       text,                                   -- 'dns' | 'file' (set on verify)
  status       text not null default 'pending',        -- pending | verified
  created_at   timestamptz not null default now(),
  verified_at  timestamptz,
  expires_at   timestamptz not null default (now() + interval '7 days')
);

alter table library.claim_challenges enable row level security;
-- No policies: table is reachable only through the SECURITY DEFINER RPCs below.

create index if not exists claim_challenges_urn_idx    on library.claim_challenges (urn);
create index if not exists claim_challenges_status_idx on library.claim_challenges (status);

-- ── library_claim_start(urn, email?) ─────────────────────────────────────────
-- Public (anon). Validates URN, requires an existing UNCLAIMED card, mints a
-- token bound to the card's own domain (from the DB, not user input), inserts a
-- pending challenge. Token uses two gen_random_uuid()s (pgcrypto not available).
create or replace function public.library_claim_start(p_urn text, p_email text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'library'
as $function$
declare v_domain text; v_status text; v_token text; v_id uuid;
begin
  if p_urn !~ '^urn:air:[a-z0-9.-]{1,128}:(business|agent|tool):[a-z0-9-]{1,128}$' then
    raise exception 'INVALID_URN';
  end if;
  select domain, status into v_domain, v_status from library.cards where urn = p_urn;
  if v_domain is null then raise exception 'CARD_NOT_FOUND'; end if;
  if v_status <> 'unclaimed' then raise exception 'ALREADY_CLAIMED'; end if;
  v_token := 'm3x-verify=' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into library.claim_challenges (urn, domain, token, email)
    values (p_urn, v_domain, v_token, lower(nullif(trim(p_email), '')))
    returning id into v_id;
  return jsonb_build_object('challenge_id', v_id, 'domain', v_domain, 'token', v_token);
end $function$;

-- ── library_claim_get(id) ────────────────────────────────────────────────────
-- Service-role only (called by the verify API). Returns what the verifier needs.
create or replace function public.library_claim_get(p_id uuid)
returns jsonb
language sql
security definer
set search_path to 'public', 'library'
as $function$
  select jsonb_build_object('urn', urn, 'domain', domain, 'token', token,
                            'status', status, 'expired', (expires_at <= now()))
  from library.claim_challenges where id = p_id;
$function$;

-- ── library_claim_complete(id, method) ───────────────────────────────────────
-- Service-role only (called after proof verified). Marks the challenge verified
-- and flips the card to claimed + domain_controlled. Only affects a card still
-- in 'unclaimed' status (domain-proof beats an earlier claim is handled upstream).
create or replace function public.library_claim_complete(p_id uuid, p_method text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'library'
as $function$
declare v_urn text; v_status text;
begin
  select urn into v_urn from library.claim_challenges
    where id = p_id and status = 'pending' and expires_at > now();
  if v_urn is null then raise exception 'CHALLENGE_INVALID'; end if;

  update library.claim_challenges
    set status = 'verified', verified_at = now(), method = p_method where id = p_id;

  update library.cards
    set status = 'claimed',
        trust = jsonb_set(
                  jsonb_set(coalesce(trust, '{}'::jsonb), '{domain_controlled}', 'true'::jsonb),
                  '{basis_string}',
                  to_jsonb('Domain-controlled — claimed ' || to_char(now(),'YYYY-MM-DD')
                           || ' via ' || p_method
                           || ' · credentials ' || coalesce(trust->>'credentials_confirmed','—')
                           || ' · claims not yet cross-checked')),
        meta = jsonb_set(coalesce(meta, '{}'::jsonb), '{status}', '"claimed"'),
        updated_at = now()
    where urn = v_urn and status = 'unclaimed';

  return jsonb_build_object('ok', true, 'urn', v_urn);
end $function$;

-- ── Grants ───────────────────────────────────────────────────────────────────
grant execute on function public.library_claim_start(text, text)  to anon, authenticated, service_role;
grant execute on function public.library_claim_get(uuid)          to service_role;
grant execute on function public.library_claim_complete(uuid, text) to service_role;
