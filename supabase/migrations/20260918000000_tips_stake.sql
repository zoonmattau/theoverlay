-- A call's stake in units, fixed when it is published: one, or a tenth on a
-- Way Overlay (a bet at $21 or more). units is the return on that stake.
alter table public.tips add column if not exists stake numeric(6,2) not null default 1;
