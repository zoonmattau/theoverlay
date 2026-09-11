import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Suspense } from "react";

import { AuthShell } from "@/app/(auth)/AuthShell";
import { AuthForm } from "@/components/AuthForm";
import { getViewer } from "@/lib/auth";
import { BONUS_DAYS, REF_COOKIE, referrerForCode } from "@/lib/referrals";

export const metadata: Metadata = {
  title: "You have been invited",
  description: "Join The Overlay on a friend's invite and you both get two weeks of the full board.",
};

export default function Page({ params }: PageProps<"/join/[code]">) {
  return (
    <Suspense fallback={<div className="page"><div className="skeleton h-96 mt-6" /></div>}>
      <Join params={params} />
    </Suspense>
  );
}

async function Join({ params }: { params: PageProps<"/join/[code]">["params"] }) {
  const { code } = await params;
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const [referrer, viewer, jar] = await Promise.all([referrerForCode(clean), getViewer(), cookies()]);
  const remembered = jar.get(REF_COOKIE)?.value;

  if (!referrer) {
    return (
      <AuthShell title="That invite link is not right" intro="Check the link your friend sent, or create an account anyway.">
        <AuthForm mode="signup" />
      </AuthShell>
    );
  }

  if (viewer.id) {
    return (
      <AuthShell title="You already have an account" intro="Invites are for new members, but you can send your own from your account.">
        <Link href="/invite" className="btn btn-primary">Invite a friend</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={`A friend has invited you`}
      intro={`Create an account, start a plan, and you both get ${BONUS_DAYS} days of the full board on top of your free trial.`}
    >
      <AuthForm mode="signup" refCode={clean} />
      {remembered && remembered !== clean && (
        <p className="mt-3 text-xs text-ink-soft">This link replaces the earlier invite you opened.</p>
      )}
    </AuthShell>
  );
}
