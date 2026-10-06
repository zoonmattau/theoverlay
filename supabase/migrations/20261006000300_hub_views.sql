-- Saved Datahub views: a name, the page and its whole query (slicers and the table's
-- filters, sort and columns), one set per member (6 Oct 2026). Run by hand in the SQL editor.
create table if not exists public.hub_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  path text not null,
  query text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists hub_views_user on public.hub_views (user_id, created_at);

-- The server reads and writes with the service key; nothing for the public.
alter table public.hub_views enable row level security;
