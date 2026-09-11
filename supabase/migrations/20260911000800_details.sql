-- Member details: name, phone, address, birth date, and how they found us.
alter table public.profiles
  add column if not exists full_name text,
  add column if not exists phone text,
  add column if not exists address1 text,
  add column if not exists address2 text,
  add column if not exists suburb text,
  add column if not exists state text,
  add column if not exists postcode text,
  add column if not exists dob date,
  add column if not exists source text;

-- The sign-up form can pass a name and a source in the user metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, accepted_terms_at, marketing_opt_in, full_name, source)
  values (
    new.id,
    new.email,
    case when coalesce(new.raw_user_meta_data->>'accepted_terms', 'false') = 'true' then now() end,
    coalesce((new.raw_user_meta_data->>'marketing_opt_in')::boolean, false),
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'source', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
