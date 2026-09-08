-- Central Pro: fonte persistente de bilhetes publicados.
create table if not exists public.central_pro_bilhetes (
  id text primary key,
  schema_version integer not null default 1 check (schema_version > 0),
  published_at timestamptz not null,
  date date not null,
  type text not null check (length(trim(type)) > 0),
  title text not null check (length(trim(title)) > 0),
  description text not null default '',
  competition text not null check (length(trim(competition)) > 0),
  status text not null default 'OPEN' check (status in ('OPEN','GREEN','RED','WAITING_DATA','VOID')),
  total_odd numeric(12,4) not null check (total_odd >= 1),
  selections jsonb not null default '[]'::jsonb check (jsonb_typeof(selections) = 'array'),
  analysis jsonb not null default '{}'::jsonb check (jsonb_typeof(analysis) = 'object'),
  source text not null default 'central-pro' check (length(trim(source)) > 0),
  settled_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (settled_at is null or settled_at >= published_at)
);

create index if not exists central_pro_bilhetes_date_idx on public.central_pro_bilhetes (date);
create index if not exists central_pro_bilhetes_status_idx on public.central_pro_bilhetes (status);
create index if not exists central_pro_bilhetes_date_status_idx on public.central_pro_bilhetes (date, status);
create index if not exists central_pro_bilhetes_published_at_idx on public.central_pro_bilhetes (published_at desc);

alter table public.central_pro_bilhetes enable row level security;
revoke all on table public.central_pro_bilhetes from anon, authenticated;
grant select, insert, update on table public.central_pro_bilhetes to service_role;

create or replace function public.central_pro_bilhetes_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function public.central_pro_bilhetes_set_updated_at() from public, anon, authenticated;

drop trigger if exists central_pro_bilhetes_updated_at on public.central_pro_bilhetes;
create trigger central_pro_bilhetes_updated_at
before update on public.central_pro_bilhetes
for each row
execute function public.central_pro_bilhetes_set_updated_at();
