import type { Metadata } from "next";
import Link from "next/link";

import { FaqList, JsonLd, faqSchema } from "@/components/JsonLd";
import { ABOUT_FAQ, PLANS_FAQ, RATINGS_FAQ } from "@/lib/faq";

export const metadata: Metadata = {
  title: "Questions",
  description: "What The Overlay is, how the ratings and calls work, and what a plan or a day pass gets you.",
  alternates: { canonical: "/faq" },
};

export default function Page() {
  return (
    <div className="page max-w-3xl">
      <JsonLd data={faqSchema([...ABOUT_FAQ, ...RATINGS_FAQ, ...PLANS_FAQ])} />
      <h1 className="font-display text-4xl font-extrabold tracking-tight mt-6">Questions</h1>
      <p className="mt-2 text-ink-secondary">
        Anything not here, email <a href="mailto:hello@theoverlay.com.au" className="text-blue">hello@theoverlay.com.au</a>.
      </p>
      <FaqList items={ABOUT_FAQ} title="The Overlay" />
      <FaqList items={RATINGS_FAQ} title="Ratings and calls" />
      <FaqList items={PLANS_FAQ} title="Plans and passes" />
      <p className="mt-10 text-sm text-ink-secondary">
        The long version of the ratings is on <Link href="/method" className="text-blue">How it works</Link>, and the plans are on <Link href="/pricing" className="text-blue">Pricing</Link>.
      </p>
    </div>
  );
}
