-- Central Pro: InfinitePay em paralelo a Asaas e PagBank.
-- Executar manualmente no Supabase antes de habilitar o checkout InfinitePay.

alter table public.payment_orders
  add column if not exists provider text not null default 'asaas',
  add column if not exists provider_checkout_id text,
  add column if not exists provider_payment_id text;

alter table public.payment_orders drop constraint if exists payment_orders_provider_check;
alter table public.payment_orders add constraint payment_orders_provider_check
  check (provider in ('asaas', 'pagbank', 'infinitepay'));

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
  check (provider in ('asaas', 'pagbank', 'infinitepay'));

create or replace function public.process_infinitepay_payment_event(
  p_event_id text,
  p_order_nsu text,
  p_transaction_nsu text,
  p_invoice_slug text,
  p_amount_cents integer
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
  v_expected_cents integer;
  v_applied boolean := false;
begin
  begin
    select * into strict v_order
    from public.payment_orders
    where id = p_order_nsu::uuid and provider = 'infinitepay'
    for update;
  exception when invalid_text_representation or no_data_found then
    raise exception 'unknown payment reference';
  end;

  v_expected_cents := round(v_order.amount * 100)::integer;
  if p_amount_cents <> v_expected_cents then raise exception 'payment amount mismatch'; end if;
  if coalesce(p_transaction_nsu, '') = '' or coalesce(p_invoice_slug, '') = '' then
    raise exception 'missing payment identifiers';
  end if;
  if v_order.provider_payment_id is not null and v_order.provider_payment_id <> p_transaction_nsu then
    raise exception 'payment reference mismatch';
  end if;
  -- provider_checkout_id é reservado ao invoice_slug confirmado.
  -- A URL criada por POST /links fica exclusivamente em payment_orders.checkout_url.
  if v_order.provider_checkout_id is not null and v_order.provider_checkout_id <> p_invoice_slug then
    raise exception 'checkout reference mismatch';
  end if;

  insert into public.payment_events (event_id, event_type, provider, provider_payment_id, payment_order_id)
  values (p_event_id, 'PAYMENT.PAID', 'infinitepay', p_transaction_nsu, v_order.id)
  on conflict (event_id) do nothing;
  if not found then
    return jsonb_build_object('duplicate', true, 'applied', false);
  end if;

  update public.payment_orders set
    -- Preenchidos somente depois da confirmação server-side em /payment_check.
    provider_checkout_id = coalesce(provider_checkout_id, p_invoice_slug),
    provider_payment_id = coalesce(provider_payment_id, p_transaction_nsu),
    status = 'paid',
    updated_at = v_now
  where id = v_order.id returning * into v_order;

  if v_order.access_applied_at is null then
    select * into strict v_access from public.user_access where user_id = v_order.user_id for update;
    v_months := case v_order.plan_id when 'monthly' then 1 when 'quarterly' then 3 else null end;
    if v_months is null then raise exception 'invalid stored plan'; end if;

    -- Lifetime é imutável; pagamentos nunca rebaixam ou sobrescrevem esse status.
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

    -- Também marca lifetime como consumido para impedir reaplicação futura do pedido.
    update public.payment_orders set access_applied_at = v_now, updated_at = v_now where id = v_order.id;
  end if;

  update public.payment_events set processed_at = v_now where event_id = p_event_id;
  return jsonb_build_object('duplicate', false, 'applied', v_applied);
end;
$$;

revoke all on function public.process_infinitepay_payment_event(text, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.process_infinitepay_payment_event(text, text, text, text, integer)
  to service_role;
