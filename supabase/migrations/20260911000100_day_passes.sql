-- Day passes: bought in bundles, spent one racing day at a time.
alter table public.profiles add column if not exists pass_credits integer not null default 0;

create table if not exists public.day_passes (
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);
alter table public.day_passes enable row level security;
create policy "Users read their own day passes"
  on public.day_passes for select using (auth.uid() = user_id);

-- Stripe checkout sessions we have already credited, so a retried webhook
-- never credits twice.
create table if not exists public.pass_purchases (
  session_id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  quantity integer not null,
  created_at timestamptz not null default now()
);
alter table public.pass_purchases enable row level security;

-- Spend one credit on a date, atomically. Returns true when a pass was used
-- (or the day was already open), false when there were no credits.
create or replace function public.redeem_day_pass(p_date date)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then return false; end if;
  if exists (select 1 from day_passes where user_id = uid and date = p_date) then
    return true;
  end if;
  update profiles set pass_credits = pass_credits - 1
    where id = uid and pass_credits > 0;
  if not found then return false; end if;
  insert into day_passes (user_id, date) values (uid, p_date);
  return true;
end;
$$;
