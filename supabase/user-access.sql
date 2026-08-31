-- Central Pro: trial seguro, único e calculado pelo relógio do PostgreSQL.
create table if not exists public.user_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trial_started_at timestamptz not null,
  trial_ends_at timestamptz not null,
  access_status text not null default 'trial'
    check (access_status in ('trial', 'expired', 'active', 'canceled')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint user_access_trial_order check (trial_ends_at > trial_started_at)
);

alter table public.user_access enable row level security;
revoke all on table public.user_access from anon, authenticated;

create or replace function public.central_pro_trial_duration()
returns interval
language sql
immutable
security definer
set search_path = public, pg_temp
as $$ select interval '24 hours' $$;

revoke all on function public.central_pro_trial_duration() from public, anon, authenticated;

create or replace function public.ensure_user_access()
returns table (
  allowed boolean,
  status text,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  remaining_seconds bigint,
  created boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_row public.user_access%rowtype;
  v_created boolean := false;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '42501'; end if;

  insert into public.user_access (user_id, trial_started_at, trial_ends_at, access_status)
  values (v_user_id, v_now, v_now + public.central_pro_trial_duration(), 'trial')
  on conflict (user_id) do nothing;
  v_created := found;

  select * into v_row from public.user_access where user_id = v_user_id for update;
  if v_row.access_status = 'trial' and v_now >= v_row.trial_ends_at then
    update public.user_access set access_status = 'expired', updated_at = v_now
    where user_id = v_user_id returning * into v_row;
  end if;

  return query select
    (v_row.access_status in ('trial', 'active') and (v_row.access_status = 'active' or v_now < v_row.trial_ends_at)),
    v_row.access_status,
    v_row.trial_started_at,
    v_row.trial_ends_at,
    case when v_row.access_status = 'trial' then greatest(0, floor(extract(epoch from (v_row.trial_ends_at - v_now)))::bigint) else 0 end,
    v_created;
end;
$$;

revoke all on function public.ensure_user_access() from public, anon;
grant execute on function public.ensure_user_access() to authenticated;
