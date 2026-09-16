-- The public Saturday review: a few storylines an admin publishes from the
-- weekly review, shown on the site and posted to Discord when they go live.
create table if not exists public.reviews (
  date text primary key,
  published_at timestamptz not null default now(),
  intro text not null default '',
  storylines jsonb not null default '[]'::jsonb,
  features jsonb not null default '[]'::jsonb,
  record jsonb not null default '{}'::jsonb
);
alter table public.reviews enable row level security;
create policy "reviews are public" on public.reviews for select using (true);
