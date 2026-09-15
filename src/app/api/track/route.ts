import { NextResponse, type NextRequest } from "next/server";

import { logEvent } from "@/lib/admin";
import { getViewer } from "@/lib/auth";

const KINDS = new Set(["plan_click", "bookie_click"]);

/** Clicks worth counting: a signed-out visitor pressing a plan button, anyone following a price out to a bookie. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { kind?: string; plan?: string; bookie?: string; raceId?: string };
  if (!body.kind || !KINDS.has(body.kind)) return NextResponse.json({ ok: false }, { status: 400 });
  const viewer = await getViewer();
  const meta: Record<string, unknown> = {};
  if (!viewer.id) meta.anonymous = true;
  if (body.bookie) meta.bookie = String(body.bookie).slice(0, 40);
  if (body.raceId) meta.raceId = String(body.raceId).slice(0, 40);
  await logEvent({ user_id: viewer.id ?? null, kind: body.kind, plan: String(body.plan ?? "").slice(0, 40) || null, amount_cents: null, meta: Object.keys(meta).length ? meta : null });
  return NextResponse.json({ ok: true });
}
