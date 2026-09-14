import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthForm } from "@/components/AuthForm";
import { AuthShell } from "@/app/(auth)/AuthShell";
import { SignupPitch } from "@/components/SignupPitch";

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
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return <AuthForm mode="signup" next={next} />;
}
