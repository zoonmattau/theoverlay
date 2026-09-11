import type { Metadata } from "next";

import { AuthForm } from "@/components/AuthForm";
import { AuthShell } from "@/app/(auth)/AuthShell";

export const metadata: Metadata = { title: "Reset password" };

export default function Page() {
  return (
    <AuthShell title="Choose a new password">
      <AuthForm mode="reset" />
    </AuthShell>
  );
}
