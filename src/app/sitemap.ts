import type { MetadataRoute } from "next";
import { connection } from "next/server";

import { allTipsters } from "@/lib/creators";
import { getTodayCard } from "@/lib/model/source";
import { listStoredDates, readStoredCard } from "@/lib/model/store";

const SITE = "https://theoverlay.com.au";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const now = new Date();
  const fixed: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE}/tips`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/method`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/faq`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/horses`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE}/signup`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/responsible-gambling`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE}/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];
  const out: MetadataRoute.Sitemap = [...fixed];
  try {
    const tipsters = await allTipsters();
    for (const t of tipsters) out.push({ url: `${SITE}/t/${t.code}`, lastModified: now, changeFrequency: "daily", priority: 0.5 });
  } catch {
    // No tipsters is fine.
  }
  try {
    const { date, meetings } = await getTodayCard();
    for (const m of meetings) {
      for (const r of m.races) {
        out.push({ url: `${SITE}/racing/${date}/${encodeURIComponent(m.meetingId)}/${encodeURIComponent(r.raceId)}`, lastModified: now, changeFrequency: "hourly", priority: 0.7 });
      }
    }
    // Past cards are results pages now: stable, and worth a place in the index.
    for (const past of (await listStoredDates(60)).filter((d) => d < date)) {
      const stored = await readStoredCard(past);
      if (!stored) continue;
      for (const m of stored.card.meetings) {
        for (const r of m.races) {
          out.push({ url: `${SITE}/racing/${past}/${encodeURIComponent(m.meetingId)}/${encodeURIComponent(r.raceId)}`, lastModified: stored.builtAt, changeFrequency: "yearly", priority: 0.4 });
        }
      }
    }
  } catch {
    // The fixed pages still go out.
  }
  return out;
}
