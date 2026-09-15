-- A tipster's social handles, shown as icons under their name.
alter table public.affiliates add column if not exists instagram text;
alter table public.affiliates add column if not exists twitter text;
alter table public.affiliates add column if not exists tiktok text;
