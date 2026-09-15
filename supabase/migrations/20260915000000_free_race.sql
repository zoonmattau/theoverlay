-- An admin's pick for the free race, kept across rebuilds; null means the
-- morning run picks it.
alter table public.cards add column if not exists free_race_id text;
