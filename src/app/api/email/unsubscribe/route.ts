import { NextResponse, type NextRequest } from "next/server";

import { supabaseAdmin } from "@/lib/billing/access";
import { unsubscribeTokenValid } from "@/lib/email/unsubscribe";

const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:#f3f4f0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#14161a">
<div style="max-width:520px;margin:60px auto;background:#fff;border:1px solid #dfe3db;border-radius:10px;padding:28px">
<h1 style="margin:0 0 10px;font-size:22px">${title}</h1><p style="margin:0;color:#454a44;line-height:1.6">${body}</p>
<p style="margin:18px 0 0"><a href="https://theoverlay.com.au/" style="color:#1f6fd6">Back to The Overlay</a></p></div></body></html>`;

/** One click from the email footer, no login needed. Also answers List-Unsubscribe-Post. */
async function handle(request: NextRequest) {
  const u = request.nextUrl.searchParams.get("u") ?? "";
  const t = request.nextUrl.searchParams.get("t") ?? "";
  if (!u || !t || !unsubscribeTokenValid(u, t)) {
    return new NextResponse(page("That link did not work", "It may be out of date. Email hello@theoverlay.com.au and we will turn tips emails off for you."), {
      status: 400,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  await supabaseAdmin().from("profiles").update({ marketing_opt_in: false }).eq("id", u);
  return new NextResponse(page("Tips emails are off", "You will still get account emails such as receipts. Turn tips emails back on any time from your account."), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export const GET = handle;
export const POST = handle;
