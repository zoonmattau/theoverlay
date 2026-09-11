-- Raw feed responses, so a card refresh only re-buys the races that are due.
create table if not exists public.fk_cache (
  key text primary key,
  kind text not null,
  data jsonb not null,
  at timestamptz not null default now()
);
create index if not exists fk_cache_kind_idx on public.fk_cache (kind, at desc);
alter table public.fk_cache enable row level security;
-- Service role only.
