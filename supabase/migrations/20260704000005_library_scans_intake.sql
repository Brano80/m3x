-- Ship-2: AEO scanner becomes the library intake. Applied to prod 2026-07-04.
-- scans table (locked schema) + service_role-only logger + public domain lookup.

create table if not exists library.scans (
  id            uuid primary key default gen_random_uuid(),
  domain        text not null,
  score         integer,
  max_score     integer,
  failed_checks text[] default '{}',
  site_title    text,
  library_urn   text,
  created_at    timestamptz not null default now()
);
create index if not exists scans_domain_idx on library.scans (domain, created_at desc);
alter table library.scans enable row level security;

create or replace function public.library_log_scan(
  p_domain text, p_score integer, p_max integer,
  p_failed text[] default '{}', p_title text default null, p_urn text default null
) returns void
language sql security definer
set search_path = public, library
as $fn$
  insert into library.scans (domain, score, max_score, failed_checks, site_title, library_urn)
  select lower(p_domain), p_score, p_max, coalesce(p_failed,'{}'), left(p_title, 300), p_urn
  where p_domain ~ '^[a-z0-9.-]{3,253}$';
$fn$;
revoke all on function public.library_log_scan(text,integer,integer,text[],text,text) from public, anon, authenticated;
grant execute on function public.library_log_scan(text,integer,integer,text[],text,text) to service_role;

create or replace function public.library_find_by_domain(p_domain text)
returns table (urn text, name text, status text, trust_score integer, one_liner text)
language sql stable security definer
set search_path = public, library
as $fn$
  select c.urn, c.name, c.status, c.trust_score, c.one_liner
  from library.cards c
  where c.domain = lower(p_domain)
  limit 1;
$fn$;
grant execute on function public.library_find_by_domain(text) to anon, authenticated, service_role;
