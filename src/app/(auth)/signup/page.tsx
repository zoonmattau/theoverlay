import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";

import { AuthForm } from "@/components/AuthForm";
import { AuthShell } from "@/app/(auth)/AuthShell";
import { SignupPitch } from "@/components/SignupPitch";
import { authProviders } from "@/lib/social";
import { AFF_COOKIE, cleanCode } from "@/lib/affiliates";

export const metadata: Metadata = { title: "Create account" };

export default function Page({ searchParams }: PageProps<"/signup">) {
  return (
    <AuthShell
      title="Create an account"
      intro="Free to join, and every plan starts with a 7-day free trial."
      pitch={{
        aside: <Suspense fallback={null}><SignupPitch dark /></Suspense>,
        inline: <Suspense fallback={null}><SignupPitch /></Suspense>,
      }}
    >
      <Suspense>
        <Form searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/signup">["searchParams"] }) {
  const [sp, jar] = await Promise.all([searchParams, cookies()]);
  const next = typeof sp.next === "string" ? sp.next : undefined;
  // The affiliate link puts its code in the URL; a cookie remembers an earlier click.
  const aff = cleanCode(typeof sp.aff === "string" ? sp.aff : jar.get(AFF_COOKIE)?.value ?? "") || undefined;
  return <AuthForm mode="signup" next={next} affCode={aff} providers={authProviders()} />;
}
