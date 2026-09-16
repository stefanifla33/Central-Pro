-- Central Pro: Minha Banca sincronizada por usuário.
-- Execute uma vez no SQL Editor do Supabase.

create table if not exists public.central_pro_bankroll_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  initial_bankroll numeric(14,2),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (initial_bankroll is null or initial_bankroll >= 0)
);

create table if not exists public.central_pro_bankroll_entries (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  competition text not null default '',
  match text not null default '',
  market text not null default '',
  selection text not null default '',
  legs jsonb not null default '[]'::jsonb check (jsonb_typeof(legs) = 'array'),
  source text not null default 'manual' check (source in ('manual','screenshot')),
  odd numeric(12,4) not null default 0 check (odd >= 0),
  stake numeric(14,2) not null default 0 check (stake >= 0),
  result text not null default 'pending' check (result in ('pending','green','red','void')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create index if not exists central_pro_bankroll_entries_user_date_idx
  on public.central_pro_bankroll_entries (user_id, date, created_at);

alter table public.central_pro_bankroll_profiles enable row level security;
alter table public.central_pro_bankroll_entries enable row level security;

-- A aplicação acessa essas tabelas somente pelo backend autenticado.
revoke all on table public.central_pro_bankroll_profiles from anon, authenticated;
revoke all on table public.central_pro_bankroll_entries from anon, authenticated;
grant select, insert, update, delete on table public.central_pro_bankroll_profiles to service_role;
grant select, insert, update, delete on table public.central_pro_bankroll_entries to service_role;
