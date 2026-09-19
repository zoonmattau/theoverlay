-- Horses we never lay. A lay is the one call that can cost more than a unit,
-- so a horse can be ruled out by hand from the race page and stay out until
-- it is let back in. Keyed on the name as the feed spells it, normalised.
create table if not exists public.lay_blocks (
  horse_key text primary key,
  horse_name text not null,
  reason text,
  added_by text,
  added_at timestamptz not null default now()
);
alter table public.lay_blocks enable row level security;
-- Service role only.
