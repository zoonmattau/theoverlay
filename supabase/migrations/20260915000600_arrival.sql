-- How a member found us: the first page they landed on, the site that sent
-- them and any campaign tags on the link. Set by the proxy on the first visit
-- and copied here at sign-up.
alter table public.profiles
  add column if not exists landing text,
  add column if not exists referrer text,
  add column if not exists utm jsonb;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, accepted_terms_at, marketing_opt_in, full_name, source, landing, referrer, utm)
  values (
    new.id,
    new.email,
    case when coalesce(new.raw_user_meta_data->>'accepted_terms', 'false') = 'true' then now() end,
    coalesce((new.raw_user_meta_data->>'marketing_opt_in')::boolean, false),
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'source', ''),
    nullif(new.raw_user_meta_data->>'landing', ''),
    nullif(new.raw_user_meta_data->>'referrer', ''),
    case when jsonb_typeof(new.raw_user_meta_data->'utm') = 'object' then new.raw_user_meta_data->'utm' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
