import { NextResponse, type NextRequest } from "next/server";

import { areaOf } from "@/lib/activity";
import { logEvent } from "@/lib/admin";
import { getViewer } from "@/lib/auth";

const KINDS = new Set(["plan_click", "bookie_click", "page_view"]);

/**
 * What is worth counting: a signed-out visitor pressing a plan button, anyone
 * following a price out to a bookie, and every page a person lands on, sorted
 * into the areas the admin activity page reports on.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { kind?: string; plan?: string; bookie?: string; raceId?: string; path?: string; vid?: string; referrer?: string };
  if (!body.kind || !KINDS.has(body.kind)) return NextResponse.json({ ok: false }, { status: 400 });
  const viewer = await getViewer();
  if (viewer.admin) return NextResponse.json({ ok: true });
  const meta: Record<string, unknown> = {};
  if (!viewer.id) meta.anonymous = true;
  if (body.bookie) meta.bookie = String(body.bookie).slice(0, 40);
  if (body.raceId) meta.raceId = String(body.raceId).slice(0, 40);
  if (body.kind === "page_view") {
    const path = String(body.path ?? "").slice(0, 200);
    if (!path.startsWith("/")) return NextResponse.json({ ok: false }, { status: 400 });
    // Crawlers read the site too; their views say nothing about members.
    if (/bot|crawl|spider|slurp|facebookexternalhit|preview/i.test(request.headers.get("user-agent") ?? "")) return NextResponse.json({ ok: true });
    Object.assign(meta, { path, ...areaOf(path) });
    if (body.vid) meta.vid = String(body.vid).slice(0, 24);
    if (body.referrer) meta.referrer = String(body.referrer).slice(0, 80);
  }
  await logEvent({ user_id: viewer.id ?? null, kind: body.kind, plan: String(body.plan ?? "").slice(0, 40) || null, amount_cents: null, meta: Object.keys(meta).length ? meta : null });
  return NextResponse.json({ ok: true });
}
