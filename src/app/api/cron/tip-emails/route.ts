import { NextResponse, type NextRequest } from "next/server";

import { supabaseAdmin } from "@/lib/billing/access";
import { remindUnpaid } from "@/lib/billing/grace";
import { notifyFollowers, TIP_EMAIL_HOUR } from "@/lib/email/tipster";
import { sydneyHour } from "@/lib/model/source";

export const maxDuration = 120;

/**
 * The midday send: one email a follower holding every call their tipster has
 * posted so far. Calls posted after this go out on their own, one email each,
 * because postTip notifies as it writes and finds a single unsent row.
 *
 * Vercel runs this hourly across the middle of the day (UTC in vercel.json, so
 * it drifts an hour with daylight saving). The first run at or after
 * TIP_EMAIL_HOUR Sydney time does the work and claims the rows; every run
 * after it finds nothing. Protected by CRON_SECRET, which Vercel sends as a
 * bearer token. ?force=1 sends without waiting for the hour.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  }
  const force = new URL(request.url).searchParams.get("force") === "1";
  const hour = sydneyHour();
  if (!force && hour < TIP_EMAIL_HOUR) {
    return NextResponse.json({ held: true, hour: Math.round(hour * 100) / 100, sendFrom: TIP_EMAIL_HOUR });
  }

  const { data, error } = await supabaseAdmin()
    .from("creator_tips")
    .select("affiliate_id")
    .is("emailed_at", null)
    .is("settled_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Members whose payment failed get their reminder here too, the one now due.
  const reminded = await remindUnpaid();
  const tipsters = [...new Set((data ?? []).map((r) => r.affiliate_id as string))];
  const sent: Record<string, number> = {};
  for (const id of tipsters) sent[id] = await notifyFollowers(id, { force });

  return NextResponse.json({
    hour: Math.round(hour * 100) / 100,
    tipsters: tipsters.length,
    emails: Object.values(sent).reduce((a, b) => a + b, 0),
    sent,
    reminded,
  });
}
