-- Commission paid to an affiliate for a calendar month, so the reports page
-- can show what is owed and what has gone out.
create table if not exists public.affiliate_payouts (
  id bigint generated always as identity primary key,
  affiliate_id uuid not null references public.affiliates (id) on delete cascade,
  -- yyyy-mm, Sydney time.
  month text not null,
  amount_cents integer not null,
  paid_at timestamptz not null default now(),
  note text,
  unique (affiliate_id, month)
);
alter table public.affiliate_payouts enable row level security;
-- Service role only.
