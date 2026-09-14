-- Every call the model publishes, at the price it was published, settled
-- when the result lands. The public record on the home page reads from here.
create table if not exists public.tips (
  id bigint generated always as identity primary key,
  date text not null,
  meeting_id text not null,
  race_id text not null,
  race_number integer not null,
  track text not null,
  tab_number integer not null,
  horse_name text not null,
  side text not null check (side in ('back', 'lay')),
  tag text,
  rated_price numeric(8,2) not null,
  -- Best market price when the call was first published; never updated.
  market_price numeric(8,2) not null,
  edge numeric(6,4),
  -- 'model' for calls the site published; 'backtest' for the model run on past cards.
  source text not null default 'model',
  published_at timestamptz not null default now(),
  finish_position integer,
  sp numeric(8,2),
  -- Level stakes, one unit, at market_price. Null until settled.
  units numeric(8,2),
  settled_at timestamptz,
  unique (race_id, tab_number, source)
);
create index if not exists tips_date_idx on public.tips (date desc);
create index if not exists tips_settled_idx on public.tips (settled_at desc) where settled_at is not null;
alter table public.tips enable row level security;
create policy "Anyone reads tips" on public.tips for select using (true);
-- Writes only from the card build, with the service role.
