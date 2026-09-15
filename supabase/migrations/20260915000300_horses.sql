-- Every horse we have seen on a card, with the form it was rated on, so a
-- member can compare any two and price up a race that has not been run.
create table if not exists public.horses (
  id text primary key,
  name text not null,
  -- The runner entry as Form King sent it, minus the market and their ratings.
  entry jsonb not null,
  class numeric,
  age integer,
  state text,
  last_track text,
  last_seen date not null,
  updated_at timestamptz not null default now()
);
create index if not exists horses_name_idx on public.horses (lower(name));
create index if not exists horses_class_idx on public.horses (class desc);
alter table public.horses enable row level security;
-- Service role only.
