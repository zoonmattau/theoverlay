// Today's visits by where they came from: page views grouped by visitor, first page's utm or referrer.
//   npx tsx --conditions=react-server --env-file=.env.local marketing/analysis/traffic.ts [yyyy-mm-dd]
import { supabaseAdmin } from "../../src/lib/billing/access";
(async () => {
  const day = process.argv[2] ?? new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  const from = new Date(`${day}T00:00:00+10:00`).toISOString();
  const rows: any[] = [];
  for (let i = 0; ; i += 1000) {
    const { data } = await supabaseAdmin().from("events").select("user_id, created_at, meta").eq("kind", "page_view").gte("created_at", from).order("created_at").range(i, i + 999);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const first = new Map<string, any>();
  const views = new Map<string, number>();
  for (const r of rows) {
    const vid = r.meta?.vid ?? r.user_id ?? "?";
    views.set(vid, (views.get(vid) ?? 0) + 1);
    if (!first.has(vid)) first.set(vid, r);
  }
  const src = (r: any) => {
    const q = new URLSearchParams(String(r.meta?.query ?? r.meta?.path?.split("?")[1] ?? ""));
    const u = r.meta?.utm ?? {};
    const s = u.source ?? q.get("utm_source");
    if (s) return `${s}${(u.campaign ?? q.get("utm_campaign")) ? "/" + (u.campaign ?? q.get("utm_campaign")) : ""}${(u.content ?? q.get("utm_content")) ? "/" + (u.content ?? q.get("utm_content")) : ""}`;
    const ref = String(r.meta?.referrer ?? "");
    if (/facebook|instagram|fb\./.test(ref)) return "meta (no tag)";
    if (/google/.test(ref)) return "google";
    return ref ? ref.replace(/^https?:\/\//, "").split("/")[0] : "direct";
  };
  const by = new Map<string, { visitors: number; views: number; members: number }>();
  for (const [vid, r] of first) {
    const k = src(r);
    const v = by.get(k) ?? { visitors: 0, views: 0, members: 0 };
    v.visitors++; v.views += views.get(vid)!; if (r.user_id) v.members++;
    by.set(k, v);
  }
  console.log(day, rows.length, "views from", first.size, "visitors");
  for (const [k, v] of [...by].sort((a, b) => b[1].visitors - a[1].visitors).slice(0, 15)) console.log(String(v.visitors).padStart(4), "visitors", String(v.views).padStart(5), "views", String(v.members).padStart(3), "logged in ", k);
  console.log("sample meta keys:", Object.keys(rows[0]?.meta ?? {}).join(","));
})();
