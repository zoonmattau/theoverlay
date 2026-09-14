-- The price on offer at the bookie named, alongside the tipster's own price.
alter table public.creator_tips add column if not exists bookie_price numeric(8,2);
