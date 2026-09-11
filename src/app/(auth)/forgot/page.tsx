import type { Metadata } from "next";

import { AuthForm } from "@/components/AuthForm";
import { AuthShell } from "@/app/(auth)/AuthShell";

export const metadata: Metadata = { title: "Forgot password" };

export default function Page() {
  return (
    <AuthShell title="Forgot your password?" intro="We will email you a link to choose a new one.">
      <AuthForm mode="forgot" />
    </AuthShell>
  );
}
