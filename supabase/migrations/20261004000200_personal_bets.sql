-- Not my_bets: that name holds the older "calls a member says they took" rows (Sep 2026).
-- A member's own bets, kept on the site: the runner (matched to our card), the bet, where it
-- was placed, and the result once the race is in. Settled by the app from our results.
-- Admin only for now; one row per bet per account so it can open to members. Service role only.
create table if not exists public.personal_bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  race_id text not null,
  meeting_id text,
  track text,
  race_number integer,
  horse text not null,
  tab_number integer,
  -- win, place or lay
  kind text not null default 'win' check (kind in ('win', 'place', 'lay')),
  stake_cents integer not null check (stake_cents > 0),
  odds numeric(8, 2) not null check (odds > 1),
  -- Where it went on: "Keisha's SB", "Betfair".
  account text,
  note text,
  finish_position integer,
  -- won, lost, void; null until the race is in
  result text check (result in ('won', 'lost', 'void')),
  profit_cents integer,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists personal_bets_user_idx on public.personal_bets (user_id, date desc);
alter table public.personal_bets enable row level security;
