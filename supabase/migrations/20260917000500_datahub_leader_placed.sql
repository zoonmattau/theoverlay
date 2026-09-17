-- The race-shape table is rebuilt from HorseEdge's race_pace (one row per
-- race, whether the leader won or placed) rather than its tempo profiles,
-- whose leader and closer columns were degenerate. Closers are not counted
-- there, so the second figure is the leader placing.
alter table public.bench_track_profile add column if not exists leader_placed_pct numeric(6,2);
alter table public.bench_track_profile add column if not exists races integer;
