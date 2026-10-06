-- A tipster's avatar: a letter or two they pick, or a round logo they upload.
-- Three tipsters all showed "T" from their names (6 Oct 2026). Run by hand in the SQL editor.
alter table public.affiliates add column if not exists avatar_letter text;
alter table public.affiliates add column if not exists avatar_url text;

-- Public bucket for the uploaded logos; the server writes with the service key, anyone can read.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;
