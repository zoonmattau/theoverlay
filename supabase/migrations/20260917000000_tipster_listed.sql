-- A tipster can be kept off public view: no directory entry, no page, no
-- calls next to the model's, while they still post and build a record.
-- Toggled from Admin > Affiliates. Off is not "active": the link still works.
alter table public.affiliates add column if not exists listed boolean not null default true;
