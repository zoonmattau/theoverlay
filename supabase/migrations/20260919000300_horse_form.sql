-- A horse's shape from its own runs, written by the card build: the best it
-- has run, and its last three against the three before. The rankings sort on
-- ability, and these say who is on the up and who is past their best.
alter table public.horses add column if not exists peak numeric(6,1);
alter table public.horses add column if not exists trend numeric(6,1);
alter table public.horses add column if not exists starts integer;
create index if not exists horses_state_idx on public.horses (state);
create index if not exists horses_last_seen_idx on public.horses (last_seen desc);
