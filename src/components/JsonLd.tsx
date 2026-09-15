/** Structured data for search and answer engines; one script per graph. */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\u003c") }} />;
}

export const SITE_URL = "https://theoverlay.com.au";

export const ORGANIZATION = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${SITE_URL}/#org`,
  name: "The Overlay",
  url: SITE_URL,
  logo: `${SITE_URL}/brand/lockup-light-stacked.png`,
  email: "hello@theoverlay.com.au",
  slogan: "The market has an opinion. We have the data.",
  areaServed: "AU",
  description: "Data-driven Australian horse racing tips: benchmark ratings, rated prices and bet or lay calls for every runner.",
};

export const WEBSITE = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE_URL}/#site`,
  url: SITE_URL,
  name: "The Overlay",
  publisher: { "@id": `${SITE_URL}/#org` },
  inLanguage: "en-AU",
};

/** The trail to a page, for the breadcrumb rich result. */
export const breadcrumbs = (trail: { name: string; path: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: trail.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.name, item: `${SITE_URL}${t.path}` })),
});

export interface Faq {
  q: string;
  a: string;
}

export const faqSchema = (items: Faq[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: items.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
});

/** A visible FAQ, the same text as the schema, so answer engines have a source to cite. */
export function FaqList({ items, title = "Questions" }: { items: Faq[]; title?: string }) {
  return (
    <section className="mt-10 max-w-3xl mx-auto" aria-labelledby="faq">
      <h2 id="faq" className="font-display text-2xl font-extrabold tracking-tight">{title}</h2>
      <dl className="mt-4 divide-y divide-line">
        {items.map((f) => (
          <div key={f.q} className="py-4">
            <dt className="font-semibold">{f.q}</dt>
            <dd className="mt-1 text-sm text-ink-secondary leading-relaxed">{f.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
