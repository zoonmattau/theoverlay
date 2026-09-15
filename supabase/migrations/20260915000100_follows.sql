-- A member can follow any number of tipsters. The old single choice on the
-- profile is carried across and left in place, unused.
create table if not exists public.follows (
  user_id uuid not null references auth.users (id) on delete cascade,
  tipster_id uuid not null references public.affiliates (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, tipster_id)
);
create index if not exists follows_tipster_idx on public.follows (tipster_id);
alter table public.follows enable row level security;
-- Service role only.
insert into public.follows (user_id, tipster_id)
  select id, tipster_id from public.profiles where tipster_id is not null
  on conflict do nothing;
