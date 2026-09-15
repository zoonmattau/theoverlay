import type { Metadata } from "next";
import { Suspense } from "react";

import { authProviders } from "@/app/(auth)/actions";
import { AuthForm } from "@/components/AuthForm";
import { AuthShell } from "@/app/(auth)/AuthShell";

export const metadata: Metadata = { title: "Log in" };

export default function Page({ searchParams }: PageProps<"/login">) {
  return (
    <AuthShell title="Log in" intro="Welcome back.">
      <Suspense>
        <Form searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return (
    <>
      {sp.error === "link" && (
        <p className="mb-4 text-sm text-red font-semibold">That link has expired, log in or sign up again.</p>
      )}
      <AuthForm mode="login" next={next} providers={await authProviders()} />
    </>
  );
}
