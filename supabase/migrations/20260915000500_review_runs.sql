-- The Saturday review: each runner's benchmarked run, bought once from the
-- Form King horse endpoint after the day and never again.
create table if not exists public.review_runs (
  date date not null,
  horse_id text not null,
  race_id text not null,
  meeting_id text not null,
  tab_number integer not null,
  -- The run as we keep it: data stage, time, sectionals against class.
  run jsonb,
  fetched_at timestamptz not null default now(),
  primary key (date, horse_id)
);
create index if not exists review_runs_date_idx on public.review_runs (date);
alter table public.review_runs enable row level security;
-- Service role only.
