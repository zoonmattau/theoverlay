-- The category ratings a horse was last rated at, so the rankings can sort on them.
alter table public.horses add column if not exists ratings jsonb;
