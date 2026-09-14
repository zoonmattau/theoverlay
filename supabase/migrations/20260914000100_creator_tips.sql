-- Partners who post their own tips. An affiliate becomes a tipster when an
-- account is linked to it; members see that tipster's calls next to ours.
alter table public.affiliates add column if not exists user_id uuid unique references auth.users (id) on delete set null;
alter table public.affiliates add column if not exists blurb text;

-- Whose tips a member sees. Set from the affiliate at sign-up, changeable in Account.
alter table public.profiles add column if not exists tipster_id uuid references public.affiliates (id) on delete set null;
create index if not exists profiles_tipster_idx on public.profiles (tipster_id);

create table if not exists public.creator_tips (
  id bigint generated always as identity primary key,
  affiliate_id uuid not null references public.affiliates (id) on delete cascade,
  date text not null,
  meeting_id text not null,
  race_id text not null,
  race_number integer not null,
  track text not null,
  tab_number integer not null,
  horse_name text not null,
  side text not null check (side in ('back', 'lay')),
  -- The price the tipster quotes when they post.
  price numeric(8,2) not null,
  comment text,
  created_at timestamptz not null default now(),
  finish_position integer,
  sp numeric(8,2),
  -- Level stakes, one unit, at price. Null until settled.
  units numeric(8,2),
  settled_at timestamptz,
  unique (affiliate_id, race_id, tab_number)
);
create index if not exists creator_tips_aff_date_idx on public.creator_tips (affiliate_id, date desc);
create index if not exists creator_tips_date_idx on public.creator_tips (date);
alter table public.creator_tips enable row level security;
create policy "Anyone reads creator tips" on public.creator_tips for select using (true);
-- Writes happen server-side with the service role, after checking the tipster owns the row.
