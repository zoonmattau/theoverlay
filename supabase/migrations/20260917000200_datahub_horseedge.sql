-- The Datahub takes in HorseEdge, the user's earlier project: 36,000 races
-- and 380,000 runs to April 2026 with sectionals behind them, and the
-- benchmark tables built from those sectionals. HorseEdge names people by
-- initials where the feed uses full names, so people are grouped on a key
-- (first initial and surname) and shown under their fullest name.
alter table public.runs add column if not exists source text not null default 'feed';
alter table public.runs add column if not exists jockey_key text;
alter table public.runs add column if not exists trainer_key text;
create index if not exists runs_jockey_key_idx on public.runs (jockey_key);
create index if not exists runs_trainer_key_idx on public.runs (trainer_key);

-- Filters: a state, a track, a date to count from, all optional.
drop function if exists public.hub_people(text);
create or replace function public.hub_people(p_kind text, p_state text default null, p_track text default null, p_since date default null)
returns table (
  name text, rides bigint, wins bigint, places bigint, expected numeric,
  rides_30 bigint, wins_30 bigint, last_ride date, win_sp numeric, first_ride date
) language sql stable security definer set search_path = public as $$
  select
    (array_agg(case when p_kind = 'trainer' then trainer else jockey end order by length(case when p_kind = 'trainer' then trainer else jockey end) desc))[1] as name,
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
  where (case when p_kind = 'trainer' then trainer_key else jockey_key end) is not null
    and finish is not null and finish > 0
    and (p_state is null or state = p_state)
    and (p_track is null or track = p_track)
    and (p_since is null or date >= p_since)
  group by (case when p_kind = 'trainer' then trainer_key else jockey_key end)
$$;

-- Jockey and trainer pairs, from the same runs.
drop function if exists public.hub_combos();
create or replace function public.hub_combos(p_state text default null, p_track text default null, p_since date default null)
returns table (jockey text, trainer text, rides bigint, wins bigint, places bigint, expected numeric, last_ride date)
language sql stable security definer set search_path = public as $$
  select
    (array_agg(jockey order by length(jockey) desc))[1] as jockey,
    (array_agg(trainer order by length(trainer) desc))[1] as trainer,
    count(*) as rides,
    count(*) filter (where finish = 1) as wins,
    count(*) filter (where finish between 1 and 3) as places,
    round(sum(coalesce(1 / nullif(bsp, 0), 1 / nullif(sp * 1.15, 0), 0))::numeric, 2) as expected,
    max(date) as last_ride
  from runs
  where jockey_key is not null and trainer_key is not null and finish is not null and finish > 0
    and (p_state is null or state = p_state)
    and (p_track is null or track = p_track)
    and (p_since is null or date >= p_since)
  group by jockey_key, trainer_key
  having count(*) >= 5
$$;

-- The states and tracks the runs cover, for the filter menus.
create or replace function public.hub_tracks_list()
returns table (track text, state text, runs bigint)
language sql stable security definer set search_path = public as $$
  select track, max(state) as state, count(*) as runs from runs where track is not null and finish is not null group by track order by count(*) desc
$$;

-- HorseEdge's benchmarks, built from its sectionals. Track names are the
-- feed's where they could be matched, so they join the runs table.
create table if not exists public.bench_track_speed (
  track text primary key,
  -- Positive is a slow track, negative quick, in HorseEdge's own units (seconds against expected over the L600).
  speed_index numeric(8,4) not null,
  metro boolean not null default false,
  sample integer not null
);
create table if not exists public.bench_l600 (
  track text not null,
  distance integer not null,
  mean_l600 numeric(7,3) not null,
  sd_l600 numeric(7,3),
  sample integer not null,
  primary key (track, distance)
);
create table if not exists public.bench_phase (
  track text not null,
  distance integer not null,
  -- early_400, early_600, L1000, L800, L600, L400, L200.
  phase text not null,
  median_s numeric(7,3) not null,
  mean_s numeric(7,3),
  sd_s numeric(7,3),
  p10 numeric(7,3), p25 numeric(7,3), p75 numeric(7,3), p90 numeric(7,3),
  sample integer not null,
  primary key (track, distance, phase)
);
create table if not exists public.bench_track_tempo (
  track text not null,
  distance_band text not null,
  condition text not null,
  early_mean numeric(7,3), early_sd numeric(7,3),
  middle_mean numeric(7,3), middle_sd numeric(7,3),
  finish600_mean numeric(7,3), finish600_sd numeric(7,3),
  -- How much a second of early tempo costs the last 600, seconds per second.
  tempo_finish_coefficient numeric(8,5),
  sample integer not null,
  primary key (track, distance_band, condition)
);
create table if not exists public.bench_track_profile (
  track text not null,
  distance integer not null,
  early_pct numeric(6,2), mid_pct numeric(6,2), finish_pct numeric(6,2),
  front_runner_win_pct numeric(6,2),
  closer_win_pct numeric(6,2),
  sample integer not null,
  primary key (track, distance)
);
alter table public.bench_track_speed enable row level security;
alter table public.bench_l600 enable row level security;
alter table public.bench_phase enable row level security;
alter table public.bench_track_tempo enable row level security;
alter table public.bench_track_profile enable row level security;
-- Service role only.

-- One person's runs, newest first, for their profile page.
create or replace function public.hub_person_runs(p_kind text, p_key text)
returns table (
  date date, track text, state text, distance integer, going text, race_name text, horse text, horse_id text,
  finish integer, margin numeric, runners integer, sp numeric, bsp numeric, weight numeric, barrier integer, other text, race_id text
) language sql stable security definer set search_path = public as $$
  select date, track, state, distance, going, race_name, horse, horse_id, finish, margin, runners, sp, bsp, weight, barrier,
    case when p_kind = 'trainer' then jockey else trainer end as other, race_id
  from runs
  where (case when p_kind = 'trainer' then trainer_key else jockey_key end) = p_key and finish is not null and finish > 0
  order by date desc
  limit 3000
$$;
