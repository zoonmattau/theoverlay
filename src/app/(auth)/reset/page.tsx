import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthForm } from "@/components/AuthForm";
import { AuthShell } from "@/app/(auth)/AuthShell";

export const metadata: Metadata = { title: "Set password" };

export default function Page({ searchParams }: PageProps<"/reset">) {
  return (
    <Suspense fallback={null}>
      <Reset searchParams={searchParams} />
    </Suspense>
  );
}

async function Reset({ searchParams }: { searchParams: PageProps<"/reset">["searchParams"] }) {
  const sp = await searchParams;
  const welcome = sp.welcome === "1";
  return (
    <AuthShell title={welcome ? "Welcome, choose a password" : "Choose a new password"}>
      <AuthForm mode="reset" />
    </AuthShell>
  );
}
