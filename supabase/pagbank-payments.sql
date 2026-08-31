-- Central Pro: suporte PagBank em paralelo ao Asaas.
-- Revisar e executar manualmente no Supabase antes de habilitar as rotas PagBank.

alter table public.payment_orders
  add column if not exists provider text not null default 'asaas',
  add column if not exists provider_checkout_id text,
  add column if not exists provider_payment_id text;

alter table public.payment_orders drop constraint if exists payment_orders_provider_check;
alter table public.payment_orders add constraint payment_orders_provider_check
  check (provider in ('asaas', 'pagbank'));

create unique index if not exists payment_orders_provider_checkout_unique
  on public.payment_orders (provider, provider_checkout_id)
  where provider_checkout_id is not null;
create unique index if not exists payment_orders_provider_payment_unique
  on public.payment_orders (provider, provider_payment_id)
  where provider_payment_id is not null;

alter table public.payment_events
  alter column asaas_payment_id drop not null,
  add column if not exists provider text not null default 'asaas',
  add column if not exists provider_payment_id text;

alter table public.payment_events drop constraint if exists payment_events_provider_check;
alter table public.payment_events add constraint payment_events_provider_check
  check (provider in ('asaas', 'pagbank'));

create or replace function public.process_pagbank_payment_event(
  p_event_id text,
  p_event_type text,
  p_payment_id text,
  p_order_reference text,
  p_amount_cents integer,
  p_verified_status text
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
  v_applied boolean := false;
  v_expected_cents integer;
begin
  if p_event_type not in (
    'ORDER.CHARGE.PAID', 'ORDER.CHARGE.DECLINED',
    'ORDER.CHARGE.CANCELED', 'CHARGEBACK.CREATED'
  ) then raise exception 'unsupported payment event'; end if;

  insert into public.payment_events (event_id, event_type, provider, provider_payment_id)
  values (p_event_id, p_event_type, 'pagbank', p_payment_id)
  on conflict (event_id) do nothing;
  if not found then
    return jsonb_build_object('duplicate', true, 'applied', false);
  end if;

  begin
    select * into strict v_order
    from public.payment_orders
    where id = p_order_reference::uuid and provider = 'pagbank'
    for update;
  exception when others then
    raise exception 'unknown payment reference';
  end;

  v_expected_cents := round(v_order.amount * 100)::integer;
  if p_amount_cents <> v_expected_cents then raise exception 'payment amount mismatch'; end if;
  if v_order.provider_payment_id is not null and v_order.provider_payment_id <> p_payment_id then
    raise exception 'payment reference mismatch';
  end if;
  if p_event_type = 'ORDER.CHARGE.PAID' and p_verified_status <> 'PAID' then
    raise exception 'payment is not paid';
  end if;

  update public.payment_events set payment_order_id = v_order.id where event_id = p_event_id;
  update public.payment_orders set
    -- Tentativas recusadas/canceladas podem ser seguidas por uma nova cobrança no mesmo checkout.
    -- Vincule definitivamente o pedido somente à cobrança que efetivamente concedeu acesso.
    provider_payment_id = case
      when p_event_type = 'ORDER.CHARGE.PAID' then coalesce(provider_payment_id, p_payment_id)
      else provider_payment_id
    end,
    status = case p_event_type
      when 'ORDER.CHARGE.PAID' then 'paid'
      when 'ORDER.CHARGE.DECLINED' then 'declined'
      when 'ORDER.CHARGE.CANCELED' then 'canceled'
      when 'CHARGEBACK.CREATED' then 'chargeback'
    end,
    updated_at = v_now
  where id = v_order.id returning * into v_order;

  -- Eventos adversos são auditados, mas nunca reduzem um acesso já concedido.
  if p_event_type = 'ORDER.CHARGE.PAID' and v_order.access_applied_at is null then
    select * into strict v_access from public.user_access where user_id = v_order.user_id for update;
    v_months := case v_order.plan_id when 'monthly' then 1 when 'quarterly' then 3 else null end;
    if v_months is null then raise exception 'invalid stored plan'; end if;

    -- Lifetime é imutável pelo sistema de pagamentos.
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
        updated_at = v_now
      where user_id = v_order.user_id;
      v_applied := found;
    end if;

    update public.payment_orders set access_applied_at = v_now, updated_at = v_now where id = v_order.id;
  end if;

  update public.payment_events set processed_at = v_now where event_id = p_event_id;
  return jsonb_build_object('duplicate', false, 'applied', v_applied);
end;
$$;

revoke all on function public.process_pagbank_payment_event(text, text, text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.process_pagbank_payment_event(text, text, text, text, integer, text)
  to service_role;
