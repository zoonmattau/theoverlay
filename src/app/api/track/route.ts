import { NextResponse, type NextRequest } from "next/server";

import { logEvent } from "@/lib/admin";
import { getViewer } from "@/lib/auth";

const KINDS = new Set(["plan_click"]);

/** A signed-out visitor pressing a plan button lands here, so the admin panel still sees the click. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { kind?: string; plan?: string };
  if (!body.kind || !KINDS.has(body.kind)) return NextResponse.json({ ok: false }, { status: 400 });
  const viewer = await getViewer();
  await logEvent({ user_id: viewer.id ?? null, kind: body.kind, plan: String(body.plan ?? "").slice(0, 40) || null, amount_cents: null, meta: viewer.id ? null : { anonymous: true } });
  return NextResponse.json({ ok: true });
}
