-- Invite a friend: both sides get two weeks of the full board. The gift has
-- its own column so Stripe never overwrites it.
alter table public.profiles add column if not exists referral_code text unique;
alter table public.profiles add column if not exists bonus_until timestamptz;

create table if not exists public.referrals (
  referred_id uuid primary key references auth.users (id) on delete cascade,
  referrer_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.referrals enable row level security;
create policy "Users read referrals they made"
  on public.referrals for select using (auth.uid() = referrer_id);

-- Applies a referral once: records it and adds 14 days to both bonus_until,
-- from now or from the existing bonus if it is still running.
create or replace function public.apply_referral(p_referred uuid, p_code text)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  ref uuid;
begin
  select id into ref from profiles where referral_code = p_code;
  if ref is null or ref = p_referred then return false; end if;
  if exists (select 1 from referrals where referred_id = p_referred) then return false; end if;
  insert into referrals (referred_id, referrer_id) values (p_referred, ref);
  update profiles set bonus_until = greatest(coalesce(bonus_until, now()), now()) + interval '14 days'
    where id in (ref, p_referred);
  return true;
end;
$$;
