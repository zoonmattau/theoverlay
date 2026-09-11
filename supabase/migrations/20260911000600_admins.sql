-- Admins can be made from the admin panel as well as ADMIN_EMAILS.
alter table public.profiles add column if not exists is_admin boolean not null default false;
