-- The ad click a new account came from, for Meta's Conversions API: Meta's _fbp and _fbc
-- cookies, IP and browser, read from the sign-up request, plus which one-off events were sent.
-- Written by the server only (src/lib/ads/meta-capi.ts).
alter table public.profiles add column if not exists meta_match jsonb;
