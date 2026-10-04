-- What the business has spent outside Meta ads (which come from Meta's API): data, hosting,
-- email, creators, one-offs. Entered by hand on the Money tab. A monthly line counts once a
-- month from its date until it is stopped. Service role only.
create table if not exists public.costs (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  amount_cents integer not null check (amount_cents > 0),
  what text not null,
  monthly boolean not null default false,
  -- The last month a monthly line counts; null while it runs.
  stopped date,
  created_at timestamptz not null default now()
);
create index if not exists costs_date_idx on public.costs (date);
alter table public.costs enable row level security;
