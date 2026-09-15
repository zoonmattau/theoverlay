"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { AFF_COOKIE, AFF_DAYS } from "@/lib/affiliates";
import { getViewer } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/billing/access";
import { tipsterByCode } from "@/lib/creators";

const refresh = (code: string) => ["/", "/tipsters", `/t/${code}`, "/tips", "/account"].forEach((p) => revalidatePath(p));

/**
 * Follow a tipster: a member's choice is saved on their profile, a visitor's
 * in the same cookie an affiliate link sets, so it carries into sign-up.
 */
export async function follow(code: string): Promise<void> {
  const t = await tipsterByCode(code);
  if (!t) return;
  const viewer = await getViewer();
  if (viewer.id) {
    await supabaseAdmin().from("follows").upsert({ user_id: viewer.id, tipster_id: t.id }, { onConflict: "user_id,tipster_id" });
  } else {
    (await cookies()).set(AFF_COOKIE, t.code, { maxAge: AFF_DAYS * 86400, path: "/", sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  }
  refresh(t.code);
}

export async function unfollow(code: string): Promise<void> {
  const viewer = await getViewer();
  const t = await tipsterByCode(code);
  if (viewer.id) {
    if (t) await supabaseAdmin().from("follows").delete().eq("user_id", viewer.id).eq("tipster_id", t.id);
  } else {
    (await cookies()).delete(AFF_COOKIE);
  }
  refresh(code);
}
