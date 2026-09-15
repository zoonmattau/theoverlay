import type { MetadataRoute } from "next";
import { connection } from "next/server";

import { getTodayCard } from "@/lib/model/source";

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
    { url: `${SITE}/signup`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/responsible-gambling`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE}/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];
  try {
    const { date, meetings } = await getTodayCard();
    const races: MetadataRoute.Sitemap = meetings.flatMap((m) =>
      m.races.map((r) => ({
        url: `${SITE}/racing/${date}/${encodeURIComponent(m.meetingId)}/${encodeURIComponent(r.raceId)}`,
        lastModified: now,
        changeFrequency: "hourly" as const,
        priority: 0.7,
      })),
    );
    return [...fixed, ...races];
  } catch {
    return fixed;
  }
}
