-- The published card for each racing date, written by the morning run and
-- refreshed through the day, so a page view never has to call Form King.
create table if not exists public.cards (
  date text primary key,
  card jsonb not null,
  built_at timestamptz not null default now(),
  refreshing_at timestamptz,
  seconds integer
);
alter table public.cards enable row level security;
-- Service role only.
