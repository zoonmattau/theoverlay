-- Calls a member says they took, with the price they got.
create table if not exists public.my_bets (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  date text not null,
  race_id text not null,
  tab_number integer not null,
  side text not null check (side in ('back', 'lay')),
  price numeric(8,2),
  stake numeric(8,2) not null default 1,
  created_at timestamptz not null default now(),
  unique (user_id, race_id, tab_number)
);
create index if not exists my_bets_user_date_idx on public.my_bets (user_id, date);
alter table public.my_bets enable row level security;
create policy "own bets" on public.my_bets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
