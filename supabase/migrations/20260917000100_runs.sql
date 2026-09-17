-- One row per horse per past run, flattened out of the entries the horses
-- table holds, so the Datahub can rank jockeys, trainers, tracks, distances
-- and goings with a group-by instead of a crawl through the form. The card
-- build adds every runner's past runs as it remembers the horse; the first
-- fill came from scripts/backfill-runs.ts.
create table if not exists public.runs (
  race_id text not null,
  horse_id text not null,
  horse text not null,
  date date not null,
  track text,
  state text,
  distance integer,
  going text,
  -- good, soft or heavy.
  going_band text,
  race_name text,
  finish integer,
  margin numeric(6,2),
  runners integer,
  weight numeric(5,1),
  barrier integer,
  sp numeric(8,2),
  bsp numeric(8,2),
  time_ms integer,
  last600_ms integer,
  -- Lengths against the class benchmark, the race and the last 600.
  vs_bench numeric(6,2),
  vs_bench600 numeric(6,2),
  jockey text,
  trainer text,
  primary key (race_id, horse_id)
);
create index if not exists runs_jockey_idx on public.runs (jockey);
create index if not exists runs_trainer_idx on public.runs (trainer);
create index if not exists runs_track_distance_idx on public.runs (track, distance);
create index if not exists runs_date_idx on public.runs (date desc);
alter table public.runs enable row level security;
-- Service role only.

-- Jockeys or trainers: rides, wins, places, what the market expected, and
-- the last thirty days. The market's chance is Betfair's SP where we have
-- it, else the bookmakers' SP with a typical margin taken out.
create or replace function public.hub_people(p_kind text)
returns table (
  name text, rides bigint, wins bigint, places bigint, expected numeric,
  rides_30 bigint, wins_30 bigint, last_ride date, win_sp numeric, first_ride date
) language sql stable security definer set search_path = public as $$
  select
    case when p_kind = 'trainer' then trainer else jockey end as name,
    count(*) as rides,
    count(*) filter (where finish = 1) as wins,
    count(*) filter (where finish between 1 and 3) as places,
    round(sum(coalesce(1 / nullif(bsp, 0), 1 / nullif(sp * 1.15, 0), 0))::numeric, 2) as expected,
    count(*) filter (where date >= current_date - 30) as rides_30,
    count(*) filter (where finish = 1 and date >= current_date - 30) as wins_30,
    max(date) as last_ride,
    round(avg(sp) filter (where finish = 1)::numeric, 2) as win_sp,
    min(date) as first_ride
  from runs
  where (case when p_kind = 'trainer' then trainer else jockey end) is not null
    and finish is not null and finish > 0
  group by 1
$$;

-- Every track and distance we have timed runs for: how many, the typical
-- time, the quickest, the typical time on each going, and how the feed's
-- benchmark reads the track on average.
create or replace function public.hub_track_distances()
returns table (
  track text, state text, distance integer, runs bigint, races bigint,
  median_ms numeric, best_ms integer, good_ms numeric, soft_ms numeric, heavy_ms numeric,
  vs_bench numeric, last_run date
) language sql stable security definer set search_path = public as $$
  select
    track, max(state) as state, distance,
    count(*) as runs,
    count(distinct race_id) as races,
    percentile_cont(0.5) within group (order by time_ms) as median_ms,
    min(time_ms) as best_ms,
    percentile_cont(0.5) within group (order by time_ms) filter (where going_band = 'good') as good_ms,
    percentile_cont(0.5) within group (order by time_ms) filter (where going_band = 'soft') as soft_ms,
    percentile_cont(0.5) within group (order by time_ms) filter (where going_band = 'heavy') as heavy_ms,
    round(avg(vs_bench)::numeric, 2) as vs_bench,
    max(date) as last_run
  from runs
  where track is not null and distance is not null and time_ms is not null and time_ms > 0
  group by track, distance
$$;
