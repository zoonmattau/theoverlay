-- Reactions on tipsters' calls: one of a few emoji, once per member per call.
create table if not exists public.tip_reactions (
  tip_id bigint not null references public.creator_tips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('fire', 'nod', 'target', 'eyes')),
  created_at timestamptz not null default now(),
  primary key (tip_id, user_id, emoji)
);
create index if not exists tip_reactions_tip_idx on public.tip_reactions (tip_id);
alter table public.tip_reactions enable row level security;
