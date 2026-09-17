-- Power against the market counts only runs that carried a price: a ride
-- with no starting price on record said nothing about what the market
-- expected, and counting it as nought flattered anyone with unpriced rides.
drop function if exists public.hub_people(text, text, text, date);
create or replace function public.hub_people(p_kind text, p_state text default null, p_track text default null, p_since date default null)
returns table (
  name text, rides bigint, wins bigint, places bigint, priced bigint, wins_priced bigint, expected numeric,
  rides_30 bigint, wins_30 bigint, last_ride date, win_sp numeric, first_ride date
) language sql stable security definer set search_path = public as $$
  select
    (array_agg(case when p_kind = 'trainer' then trainer else jockey end order by length(case when p_kind = 'trainer' then trainer else jockey end) desc))[1] as name,
    count(*) as rides,
    count(*) filter (where finish = 1) as wins,
    count(*) filter (where finish between 1 and 3) as places,
    count(*) filter (where coalesce(bsp, sp, 0) > 1) as priced,
    count(*) filter (where finish = 1 and coalesce(bsp, sp, 0) > 1) as wins_priced,
    round(sum(case when bsp > 1 then 1 / bsp when sp > 1 then 1 / (sp * 1.15) else 0 end)::numeric, 2) as expected,
    count(*) filter (where date >= current_date - 30) as rides_30,
    count(*) filter (where finish = 1 and date >= current_date - 30) as wins_30,
    max(date) as last_ride,
    round(avg(sp) filter (where finish = 1 and sp > 1)::numeric, 2) as win_sp,
    min(date) as first_ride
  from runs
  where (case when p_kind = 'trainer' then trainer_key else jockey_key end) is not null
    and finish is not null and finish > 0
    and (p_state is null or state = p_state)
    and (p_track is null or track = p_track)
    and (p_since is null or date >= p_since)
  group by (case when p_kind = 'trainer' then trainer_key else jockey_key end)
$$;

drop function if exists public.hub_combos(text, text, date);
create or replace function public.hub_combos(p_state text default null, p_track text default null, p_since date default null)
returns table (jockey text, trainer text, rides bigint, wins bigint, places bigint, priced bigint, wins_priced bigint, expected numeric, last_ride date)
language sql stable security definer set search_path = public as $$
  select
    (array_agg(jockey order by length(jockey) desc))[1] as jockey,
    (array_agg(trainer order by length(trainer) desc))[1] as trainer,
    count(*) as rides,
    count(*) filter (where finish = 1) as wins,
    count(*) filter (where finish between 1 and 3) as places,
    count(*) filter (where coalesce(bsp, sp, 0) > 1) as priced,
    count(*) filter (where finish = 1 and coalesce(bsp, sp, 0) > 1) as wins_priced,
    round(sum(case when bsp > 1 then 1 / bsp when sp > 1 then 1 / (sp * 1.15) else 0 end)::numeric, 2) as expected,
    max(date) as last_ride
  from runs
  where jockey_key is not null and trainer_key is not null and finish is not null and finish > 0
    and (p_state is null or state = p_state)
    and (p_track is null or track = p_track)
    and (p_since is null or date >= p_since)
  group by jockey_key, trainer_key
  having count(*) >= 5
$$;
