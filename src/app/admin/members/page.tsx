import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { deleteMember, inviteMember } from "@/app/admin/actions";
import { accountState, isAdmin, listMembers, now as clock } from "@/lib/admin";
import { getViewer } from "@/lib/auth";
import { planById, PLANS } from "@/lib/billing/plans";
import { supabaseAdmin } from "@/lib/billing/access";
import { allTipsters } from "@/lib/creators";
import { MembersTable, type MemberRow } from "../MembersTable";

export const metadata: Metadata = { title: "Members", robots: { index: false } };

export default function Page() {
  return (
    <div className="page">
      <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
        <Members />
      </Suspense>
    </div>
  );
}

async function removeFromList(id: string) {
  "use server";
  await deleteMember(id, true);
}

async function Members() {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) notFound();
  const [members, tipsters, { data: affiliates }] = await Promise.all([listMembers(), allTipsters({ unlisted: true }), supabaseAdmin().from("affiliates").select("id, code")]);
  const tipsterIds = new Set(tipsters.map((t) => t.user_id));
  const codeOf = new Map((affiliates ?? []).map((a) => [a.id as string, a.code as string]));
  const now = clock();
  const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0);
  const rows: MemberRow[] = members.map((m) => {
    const live = Boolean(m.access_until && new Date(m.access_until).getTime() > now && !m.paused_at);
    return {
      id: m.id,
      name: m.full_name || m.email || m.id,
      email: m.email ?? "",
      haystack: [m.full_name, m.email, m.phone, m.suburb, m.postcode, m.referral_code, m.affiliate_id ? codeOf.get(m.affiliate_id) : null, m.source].filter(Boolean).join(" ").toLowerCase(),
      account: accountState(m),
      admin: Boolean(m.is_admin),
      tipster: tipsterIds.has(m.id),
      plan: m.plan ? (planById(m.plan)?.name ?? m.plan) : "",
      affiliate: (m.affiliate_id && codeOf.get(m.affiliate_id)) || "",
      source: (m.source ?? "signup").replace(/^affiliate:.*/, "affiliate"),
      status: m.paused_at ? "paused" : live ? "live" : "none",
      statusLabel: m.paused_at ? "Paused" : live ? (m.subscription_status ?? "active") : (m.subscription_status ?? "none"),
      accessUntil: ms(m.access_until),
      since: ms(m.subscribed_since) || ms(m.created_at),
      spent: m.total_spent_cents ?? 0,
      passes: m.pass_credits,
      gift: m.bonus_until && new Date(m.bonus_until).getTime() > now ? ms(m.bonus_until) : 0,
      emails: Boolean(m.marketing_opt_in),
      lastSeen: ms(m.last_seen_at) || ms(m.last_sign_in_at),
    };
  });


  return (
    <>
      <section className="py-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Members</h1>
        <p className="mt-1 text-sm text-ink-soft">Everyone with an account. Click a name for the full record.</p>
      </section>

      <div className="card mb-6">
        <h2 className="font-display font-extrabold">Invite someone</h2>
        <p className="mt-1 text-sm text-ink-secondary">Creates the account and emails them a one-time link to set a password.</p>
        <form action={inviteMember} className="mt-3 flex flex-wrap items-end gap-3 text-sm">
          <label className="field"><span>Email</span><input name="email" type="email" required className="field-input w-64" placeholder="name@example.com" /></label>
          <label className="field"><span>Gift days</span><input name="days" type="number" defaultValue={14} min={0} className="field-input w-24" /></label>
          <label className="flex items-center gap-2 pb-2"><input name="admin" type="checkbox" /> Make admin</label>
          <button className="btn btn-primary btn-sm" type="submit">Send invite</button>
        </form>
      </div>

      <MembersTable rows={rows} plans={PLANS.map((p) => p.name)} remove={removeFromList} self={viewer.id} />
    </>
  );
}
