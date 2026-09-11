-- What the admin panel needs: an event log and a few running totals.
create table if not exists public.events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  kind text not null,          -- plan_click, checkout_started, checkout_completed, payment, subscription, admin
  plan text,
  amount_cents integer,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_user_idx on public.events (user_id, created_at desc);
create index if not exists events_kind_idx on public.events (kind, created_at desc);
alter table public.events enable row level security;
-- Written and read with the service role only.

alter table public.profiles add column if not exists total_spent_cents integer not null default 0;
alter table public.profiles add column if not exists subscribed_since timestamptz;
alter table public.profiles add column if not exists subscription_status text;
alter table public.profiles add column if not exists paused_at timestamptz;
alter table public.profiles add column if not exists admin_note text;
