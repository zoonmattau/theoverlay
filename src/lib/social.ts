/** The social log ins we can offer, once switched on in Supabase Auth and in NEXT_PUBLIC_AUTH_PROVIDERS. */
export const PROVIDERS = { google: "Google" } as const;
export type Provider = keyof typeof PROVIDERS;

/** What the sign-up form said, kept for the few minutes a provider takes, then applied to the new account. */
export const OAUTH_COOKIE = "overlay_oauth";

/** The providers switched on in the environment: NEXT_PUBLIC_AUTH_PROVIDERS=google. */
export function authProviders(): Provider[] {
  return (process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? "").split(",").map((s) => s.trim()).filter((s): s is Provider => s in PROVIDERS);
}

/** Where The Overlay lives off the site. */
export const BRAND_SOCIAL = {
  instagram: "theoverlay_au",
  twitter: "theoverlay_au",
  discord: "https://discord.gg/V6Ww8xUve8",
} as const;

/** The results: every call settled, in the shared Google sheet. Linked from the footer only (2 Oct 2026). */
export const RESULTS_SHEET = "https://docs.google.com/spreadsheets/d/1REbe9VXjEswkg2E94RKAdjNKC1BzQzDmRzFIqafyk_4/edit?usp=sharing";
