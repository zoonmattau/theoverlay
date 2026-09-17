import type { Metadata } from "next";
import { Suspense } from "react";

import { HubNav } from "./HubNav";

export const metadata: Metadata = {
  title: "Datahub",
  description: "Jockeys, trainers, tracks, distances and goings, ranked from every run on the form we hold.",
  alternates: { canonical: "/data/horses" },
};

export default function Layout({ children }: LayoutProps<"/data">) {
  return (
    <div className="page max-w-6xl">
      <section className="pt-6">
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight">Datahub</h1>
        <p className="mt-2 text-ink-secondary max-w-2xl">
          The numbers behind the ratings. Every horse, jockey, trainer, track, distance and going, from every past run on the form of every horse we have rated. Click a heading to sort, type to filter.
        </p>
        <Suspense fallback={<div className="tabs mt-4" />}>
          <HubNav />
        </Suspense>
      </section>
      {children}
    </div>
  );
}
