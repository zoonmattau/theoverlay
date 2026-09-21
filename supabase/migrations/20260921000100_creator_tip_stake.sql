-- How many units the tipster has on the call. Settles as units times the
-- level-stakes return, and the record's ROI divides by units staked.
alter table public.creator_tips add column if not exists stake numeric(5,2) not null default 1 check (stake > 0);
