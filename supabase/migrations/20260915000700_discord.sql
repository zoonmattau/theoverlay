-- Discord: what the bot has posted for each date, and which member is which
-- Discord account so the Member role can follow their access.
create table if not exists public.discord_posts (
  date text not null,
  kind text not null,
  message_id text,
  posted_at timestamptz not null default now(),
  primary key (date, kind)
);
alter table public.discord_posts enable row level security;

alter table public.profiles
  add column if not exists discord_id text,
  add column if not exists discord_name text,
  add column if not exists discord_linked_at timestamptz;
create unique index if not exists profiles_discord_id_idx on public.profiles (discord_id) where discord_id is not null;
