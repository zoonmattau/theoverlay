-- The fortnight is earned when the invited friend starts a plan, not at sign-up.
alter table public.referrals add column if not exists rewarded_at timestamptz;

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
  return true;
end;
$$;

-- Pays both sides once, when the friend's subscription starts. Returns the referrer.
create or replace function public.reward_referral(p_referred uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  ref uuid;
begin
  select referrer_id into ref from referrals where referred_id = p_referred and rewarded_at is null;
  if ref is null then return null; end if;
  update referrals set rewarded_at = now() where referred_id = p_referred;
  update profiles set bonus_until = greatest(coalesce(bonus_until, now()), now()) + interval '14 days'
    where id in (ref, p_referred);
  return ref;
end;
$$;
