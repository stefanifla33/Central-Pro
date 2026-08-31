-- Central Pro: planos pagos, pedidos e idempotência de webhooks Asaas.
alter table public.user_access add column if not exists plan_id text;
alter table public.user_access add column if not exists access_expires_at timestamptz;
alter table public.user_access add column if not exists asaas_customer_id text;
alter table public.user_access add column if not exists asaas_payment_id text;

create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null check (plan_id in ('monthly', 'quarterly')),
  amount numeric(10,2) not null,
  status text not null default 'pending',
  asaas_checkout_id text unique,
  asaas_payment_id text unique,
  asaas_customer_id text,
  checkout_url text,
  access_applied_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint payment_orders_plan_amount_check check (
    (plan_id = 'monthly' and amount = 19.90)
    or (plan_id = 'quarterly' and amount = 49.90)
  )
);

create table if not exists public.payment_events (
  event_id text primary key,
  event_type text not null,
  asaas_payment_id text not null,
  payment_order_id uuid references public.payment_orders(id) on delete set null,
  received_at timestamptz not null default clock_timestamp(),
  processed_at timestamptz
);

alter table public.payment_orders enable row level security;
alter table public.payment_events enable row level security;
revoke all on table public.payment_orders from anon, authenticated;
revoke all on table public.payment_events from anon, authenticated;
revoke all on table public.user_access from anon, authenticated;
grant select, insert, update on table public.payment_orders to service_role;
grant select, insert, update on table public.payment_events to service_role;
grant select, update on table public.user_access to service_role;

create or replace function public.process_asaas_payment_event(
  p_event_id text,
  p_event_type text,
  p_payment_id text,
  p_external_reference text,
  p_customer_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_order public.payment_orders%rowtype;
  v_access public.user_access%rowtype;
  v_months integer;
  v_duplicate boolean := false;
  v_applied boolean := false;
begin
  if p_event_type not in (
    'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_OVERDUE', 'PAYMENT_REFUNDED',
    'PAYMENT_DELETED', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE'
  ) then raise exception 'unsupported payment event'; end if;

  insert into public.payment_events (event_id, event_type, asaas_payment_id)
  values (p_event_id, p_event_type, p_payment_id)
  on conflict (event_id) do nothing;
  if not found then
    return jsonb_build_object('duplicate', true, 'applied', false);
  end if;

  begin
    select * into strict v_order
    from public.payment_orders
    where id = p_external_reference::uuid
    for update;
  exception when others then
    raise exception 'unknown payment reference';
  end;

  if v_order.asaas_payment_id is not null and v_order.asaas_payment_id <> p_payment_id then
    raise exception 'payment reference mismatch';
  end if;

  update public.payment_events set payment_order_id = v_order.id where event_id = p_event_id;
  update public.payment_orders set
    asaas_payment_id = coalesce(asaas_payment_id, p_payment_id),
    asaas_customer_id = coalesce(asaas_customer_id, p_customer_id),
    status = lower(replace(p_event_type, 'PAYMENT_', '')),
    updated_at = v_now
  where id = v_order.id returning * into v_order;

  -- Eventos adversos ficam registrados para auditoria, mas não revogam user_access:
  -- outro pagamento válido pode ser a origem do acesso atualmente vigente.
  if p_event_type in ('PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED') and v_order.access_applied_at is null then
    select * into strict v_access from public.user_access where user_id = v_order.user_id for update;
    v_months := case v_order.plan_id when 'monthly' then 1 when 'quarterly' then 3 else null end;
    if v_months is null then raise exception 'invalid stored plan'; end if;

    if v_access.access_status <> 'lifetime' then
      update public.user_access set
        access_status = 'active',
        plan_id = v_order.plan_id,
        access_expires_at = (
          case
            when v_access.access_status = 'active' and v_access.access_expires_at > v_now then v_access.access_expires_at
            else v_now
          end
        ) + make_interval(months => v_months),
        asaas_customer_id = coalesce(p_customer_id, asaas_customer_id),
        asaas_payment_id = p_payment_id,
        updated_at = v_now
      where user_id = v_order.user_id;
      v_applied := found;
    end if;

    update public.payment_orders set access_applied_at = v_now, updated_at = v_now where id = v_order.id;
  end if;

  update public.payment_events set processed_at = v_now where event_id = p_event_id;
  return jsonb_build_object('duplicate', v_duplicate, 'applied', v_applied);
end;
$$;

revoke all on function public.process_asaas_payment_event(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.process_asaas_payment_event(text, text, text, text, text) to service_role;

drop function if exists public.ensure_user_access();
create function public.ensure_user_access()
returns table (
  allowed boolean,
  status text,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  remaining_seconds bigint,
  created boolean,
  plan_id text,
  access_expires_at timestamptz
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
  if (v_row.access_status = 'trial' and v_now >= v_row.trial_ends_at)
     or (v_row.access_status = 'active' and (v_row.access_expires_at is null or v_now >= v_row.access_expires_at)) then
    update public.user_access set access_status = 'expired', updated_at = v_now
    where user_id = v_user_id returning * into v_row;
  end if;

  return query select
    (v_row.access_status = 'lifetime'
      or (v_row.access_status = 'active' and v_now < v_row.access_expires_at)
      or (v_row.access_status = 'trial' and v_now < v_row.trial_ends_at)),
    v_row.access_status,
    case when v_row.access_status = 'lifetime' then null else v_row.trial_started_at end,
    case when v_row.access_status = 'lifetime' then null else v_row.trial_ends_at end,
    case when v_row.access_status = 'trial' then greatest(0, floor(extract(epoch from (v_row.trial_ends_at - v_now)))::bigint) else null end,
    v_created,
    case when v_row.access_status = 'active' then v_row.plan_id else null end,
    case when v_row.access_status = 'active' then v_row.access_expires_at else null end;
end;
$$;

revoke all on function public.ensure_user_access() from public, anon;
grant execute on function public.ensure_user_access() to authenticated;
