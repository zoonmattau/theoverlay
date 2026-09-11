// Signs in as a throwaway test user and calls the production checkout route.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = "overlay-probe@theoverlay.com.au", password = "ProbePass1234!";
const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
let user = list.users.find((u) => u.email === email);
if (!user) ({ data: { user } } = await admin.auth.admin.createUser({ email, password, email_confirm: true }));
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: { session }, error } = await anon.auth.signInWithPassword({ email, password });
if (error) throw error;
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
for (const body of [{ passes: 1 }, { plan: "saturday" }]) {
  const res = await fetch((process.argv[2] ?? "https://theoverlay.com.au") + "/api/stripe/checkout", {
    method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body),
  });
  const t0 = Date.now();
  console.log(JSON.stringify(body), res.status, (await res.text()).slice(0, 120), `${Date.now() - t0}ms`);
}
