-- When a member last loaded a page, written at most every 15 minutes.
alter table public.profiles add column if not exists last_seen_at timestamptz;
