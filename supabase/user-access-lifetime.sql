-- Central Pro: adiciona acesso vitalício sem recriar a tabela ou alterar usuários.
do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.user_access'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%access_status%'
  loop
    execute format('alter table public.user_access drop constraint %I', v_constraint.conname);
  end loop;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_access'::regclass
      and conname = 'user_access_status_check'
  ) then
    alter table public.user_access
      add constraint user_access_status_check
      check (access_status in ('trial', 'expired', 'active', 'canceled', 'lifetime'));
  end if;
end;
$$;

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
    (v_row.access_status in ('active', 'lifetime') or (v_row.access_status = 'trial' and v_now < v_row.trial_ends_at)),
    v_row.access_status,
    case when v_row.access_status = 'lifetime' then null else v_row.trial_started_at end,
    case when v_row.access_status = 'lifetime' then null else v_row.trial_ends_at end,
    case
      when v_row.access_status = 'lifetime' then null
      when v_row.access_status = 'trial' then greatest(0, floor(extract(epoch from (v_row.trial_ends_at - v_now)))::bigint)
      else 0
    end,
    v_created;
end;
$$;

revoke all on function public.ensure_user_access() from public, anon;
grant execute on function public.ensure_user_access() to authenticated;
