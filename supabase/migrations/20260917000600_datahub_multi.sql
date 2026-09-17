-- Rankings cut any way at once: several states, several tracks, several
-- goings by their number (Good 4 and Soft 5 and Soft 6 but not Soft 7),
-- several exact distances or a distance range, and a period.
drop function if exists public.hub_people(text, text, text[], date, text, integer, integer);
create or replace function public.hub_people(
  p_kind text, p_states text[] default null, p_tracks text[] default null, p_since date default null,
  p_goings integer[] default null, p_distances integer[] default null, p_dist_lo integer default null, p_dist_hi integer default null
)
returns table (
  name text, rides bigint, wins bigint, places bigint,
  priced_bsp bigint, priced_sp bigint, wins_bsp bigint, wins_sp bigint, expected_bsp numeric, expected_sp numeric,
  rides_30 bigint, wins_30 bigint, last_ride date, win_sp numeric, first_ride date
) language sql stable security definer set search_path = public as $$
  select
    (array_agg(case when p_kind = 'trainer' then trainer else jockey end order by length(case when p_kind = 'trainer' then trainer else jockey end) desc))[1] as name,
    count(*) as rides,
    count(*) filter (where finish = 1) as wins,
    count(*) filter (where finish between 1 and 3) as places,
    count(*) filter (where bsp > 1) as priced_bsp,
    count(*) filter (where not (bsp > 1) and sp > 1) as priced_sp,
    count(*) filter (where finish = 1 and bsp > 1) as wins_bsp,
    count(*) filter (where finish = 1 and not (bsp > 1) and sp > 1) as wins_sp,
    round(sum(case when bsp > 1 then 1 / bsp else 0 end)::numeric, 3) as expected_bsp,
    round(sum(case when not (bsp > 1) and sp > 1 then 1 / sp else 0 end)::numeric, 3) as expected_sp,
    count(*) filter (where date >= current_date - 30) as rides_30,
    count(*) filter (where finish = 1 and date >= current_date - 30) as wins_30,
    max(date) as last_ride,
    round(avg(sp) filter (where finish = 1 and sp > 1)::numeric, 2) as win_sp,
    min(date) as first_ride
  from runs
  where (case when p_kind = 'trainer' then trainer_key else jockey_key end) is not null
    and finish is not null and finish > 0
    and (p_states is null or state = any(p_states))
    and (p_tracks is null or track = any(p_tracks))
    and (p_since is null or date >= p_since)
    and (p_goings is null or nullif(regexp_replace(coalesce(going, ''), '\D', '', 'g'), '')::integer = any(p_goings))
    and (p_distances is null or distance = any(p_distances))
    and (p_dist_lo is null or distance >= p_dist_lo)
    and (p_dist_hi is null or distance < p_dist_hi)
  group by (case when p_kind = 'trainer' then trainer_key else jockey_key end)
$$;

drop function if exists public.hub_combos(text, text[], date, text, integer, integer);
create or replace function public.hub_combos(
  p_states text[] default null, p_tracks text[] default null, p_since date default null,
  p_goings integer[] default null, p_distances integer[] default null, p_dist_lo integer default null, p_dist_hi integer default null
)
returns table (
  jockey text, trainer text, rides bigint, wins bigint, places bigint,
  priced_bsp bigint, priced_sp bigint, wins_bsp bigint, wins_sp bigint, expected_bsp numeric, expected_sp numeric, last_ride date
) language sql stable security definer set search_path = public as $$
  select
    (array_agg(jockey order by length(jockey) desc))[1] as jockey,
    (array_agg(trainer order by length(trainer) desc))[1] as trainer,
    count(*) as rides,
    count(*) filter (where finish = 1) as wins,
    count(*) filter (where finish between 1 and 3) as places,
    count(*) filter (where bsp > 1) as priced_bsp,
    count(*) filter (where not (bsp > 1) and sp > 1) as priced_sp,
    count(*) filter (where finish = 1 and bsp > 1) as wins_bsp,
    count(*) filter (where finish = 1 and not (bsp > 1) and sp > 1) as wins_sp,
    round(sum(case when bsp > 1 then 1 / bsp else 0 end)::numeric, 3) as expected_bsp,
    round(sum(case when not (bsp > 1) and sp > 1 then 1 / sp else 0 end)::numeric, 3) as expected_sp,
    max(date) as last_ride
  from runs
  where jockey_key is not null and trainer_key is not null and finish is not null and finish > 0
    and (p_states is null or state = any(p_states))
    and (p_tracks is null or track = any(p_tracks))
    and (p_since is null or date >= p_since)
    and (p_goings is null or nullif(regexp_replace(coalesce(going, ''), '\D', '', 'g'), '')::integer = any(p_goings))
    and (p_distances is null or distance = any(p_distances))
    and (p_dist_lo is null or distance >= p_dist_lo)
    and (p_dist_hi is null or distance < p_dist_hi)
  group by jockey_key, trainer_key
  having count(*) >= 5
$$;
