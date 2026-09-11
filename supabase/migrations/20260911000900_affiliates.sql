-- Affiliates: partners who send traffic through /go/CODE and earn a cut.
create table if not exists public.affiliates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  email text,
  commission_pct numeric(5,2) not null default 20,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.affiliate_clicks (
  id bigint generated always as identity primary key,
  affiliate_id uuid not null references public.affiliates (id) on delete cascade,
  landing text,
  referrer text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists affiliate_clicks_aff_idx on public.affiliate_clicks (affiliate_id, created_at desc);
alter table public.affiliates enable row level security;
alter table public.affiliate_clicks enable row level security;
-- Service role only.

alter table public.profiles add column if not exists affiliate_id uuid references public.affiliates (id) on delete set null;
alter table public.profiles add column if not exists affiliate_attributed_at timestamptz;
create index if not exists profiles_affiliate_idx on public.profiles (affiliate_id);
