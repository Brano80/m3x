-- Agent-test waitlist/orders (test+fix funnel, Step 0). Applied to prod 2026-07-04.
create table if not exists library.test_requests (
  id         uuid primary key default gen_random_uuid(),
  domain     text not null,
  email      text not null,
  task       text,
  status     text not null default 'requested',  -- requested | scheduled | delivered
  created_at timestamptz not null default now()
);
create index if not exists test_requests_created_idx on library.test_requests (created_at desc);
alter table library.test_requests enable row level security;

create or replace function public.library_log_test_request(
  p_domain text, p_email text, p_task text default null
) returns void
language sql security definer
set search_path = public, library
as $fn$
  insert into library.test_requests (domain, email, task)
  select lower(p_domain), lower(p_email), left(p_task, 500)
  where p_domain ~ '^[a-z0-9.-]{3,253}$'
    and p_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';
$fn$;
revoke all on function public.library_log_test_request(text,text,text) from public, anon, authenticated;
grant execute on function public.library_log_test_request(text,text,text) to service_role;
