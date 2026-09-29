-- Members' API keys: one live key each, stored as a hash, read by the tips API.
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- sha256 of the key, hex. The key itself is shown once and never stored.
  key_hash text not null unique,
  -- The first characters, so the member can tell which key is live.
  prefix text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  last_ip text,
  uses bigint not null default 0,
  revoked_at timestamptz
);
create index if not exists api_keys_user_idx on public.api_keys (user_id) where revoked_at is null;
alter table public.api_keys enable row level security;
