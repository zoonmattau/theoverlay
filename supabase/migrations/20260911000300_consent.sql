-- Consent captured at sign-up, copied from the auth metadata by the trigger.
alter table public.profiles add column if not exists accepted_terms_at timestamptz;
alter table public.profiles add column if not exists marketing_opt_in boolean not null default false;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, accepted_terms_at, marketing_opt_in)
  values (
    new.id,
    new.email,
    case when coalesce(new.raw_user_meta_data->>'accepted_terms', 'false') = 'true' then now() end,
    coalesce((new.raw_user_meta_data->>'marketing_opt_in')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
