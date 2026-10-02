import type { Metadata } from "next";
import Link from "next/link";

import { JsonLd, faqSchema, type Faq } from "@/components/JsonLd";
import { ABOUT_FAQ, PLANS_FAQ, RATINGS_FAQ } from "@/lib/faq";
import { BRAND_SOCIAL } from "@/lib/social";

export const metadata: Metadata = {
  title: "Questions",
  description: "What The Overlay is, how the ratings and calls work, and what a plan or a day pass gets you.",
  alternates: { canonical: "/faq" },
};

const GROUPS: { id: string; letter: string; title: string; items: Faq[] }[] = [
  { id: "about", letter: "O", title: "The Overlay", items: ABOUT_FAQ },
  { id: "ratings", letter: "R", title: "Ratings and calls", items: RATINGS_FAQ },
  { id: "plans", letter: "P", title: "Plans and passes", items: PLANS_FAQ },
];

/**
 * Every question, grouped the way the race pages are: a dark bar per group,
 * each question opening to its answer and the buttons to where it points.
 * The answers sit in the page closed or open, so the schema has its source.
 */
export default function Page() {
  return (
    <div className="page max-w-3xl">
      <JsonLd data={faqSchema(GROUPS.flatMap((g) => g.items))} />
      <section className="py-8">
        <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight">Questions</h1>
        <p className="mt-2 text-ink-secondary">How the ratings and calls work, how results are settled, and what a plan or a day pass gets you.</p>
        <nav className="mt-5 flex flex-wrap gap-2" aria-label="Jump to">
          {GROUPS.map((g) => (
            <a key={g.id} href={`#${g.id}`} className="faq-link">
              {g.title} <span className="text-ink-soft font-normal nums">{g.items.length}</span>
            </a>
          ))}
        </nav>
      </section>

      <div className="space-y-6">
        {GROUPS.map((g) => (
          <section key={g.id} id={g.id} className="section scroll-mt-24">
            <div className="section-bar">
              <span className="section-letter">{g.letter}</span>
              <h2>{g.title}</h2>
            </div>
            <div className="divide-y divide-line-soft">
              {g.items.map((f) => (
                <details key={f.q} className="group px-4 sm:px-5">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-4 py-4 font-semibold [&::-webkit-details-marker]:hidden">
                    <span>{f.q}</span>
                    <span className="mt-0.5 text-ink-soft transition-transform group-open:rotate-45 text-xl leading-none" aria-hidden>+</span>
                  </summary>
                  <div className="pb-5 -mt-1">
                    <p className="text-sm text-ink-secondary leading-relaxed">{f.a}</p>
                    {f.links && f.links.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {f.links.map((l) =>
                          /^https?:/.test(l.href) ? (
                            <a key={l.href} href={l.href} className="faq-link" target="_blank" rel="noopener">
                              {l.label} <span aria-hidden>→</span>
                            </a>
                          ) : (
                            <Link key={l.href} href={l.href} className="faq-link">
                              {l.label} <span aria-hidden>→</span>
                            </Link>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="card mt-8 mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-extrabold tracking-tight">Still stuck?</h2>
          <p className="mt-1 text-sm text-ink-secondary">
            Email <a href="mailto:hello@theoverlay.com.au" className="text-blue font-semibold">hello@theoverlay.com.au</a> or ask in the Discord.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={BRAND_SOCIAL.discord} className="faq-link" target="_blank" rel="noopener">
            Join the Discord <span aria-hidden>→</span>
          </a>
          <Link href="/method" className="faq-link">
            How it works <span aria-hidden>→</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
