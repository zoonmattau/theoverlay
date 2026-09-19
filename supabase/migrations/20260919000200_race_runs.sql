-- A runner's last runs, kept beside the card rather than inside it. They were
-- 4.5MB of a 5.9MB card, carried on every page view of every race, when only
-- the race being looked at ever reads them.
create table if not exists public.race_runs (
  date date not null,
  race_id text not null,
  -- { "<tab number>": PublishedRun[] }
  runs jsonb not null,
  built_at timestamptz not null default now(),
  primary key (date, race_id)
);
create index if not exists race_runs_date_idx on public.race_runs (date);
alter table public.race_runs enable row level security;
-- Service role only.
