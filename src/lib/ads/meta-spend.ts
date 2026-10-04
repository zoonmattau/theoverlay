import "server-only";

import { cacheLife } from "next/cache";

/**
 * Meta's ad spend by day, read from the Marketing API with a read-only token
 * (META_ADS_TOKEN, a system user with ads_read) on META_AD_ACCOUNT
 * ("act_123…" or the bare number). Days are the ad account's own, which is
 * set to Sydney time. Cached for an hour: spend is final the next morning and
 * the Money tab does not need it to the minute. Undefined when the token is
 * not set, so the page can say so instead of showing $0.
 */
export interface SpendDay {
  date: string;
  /** Dollars, all campaigns. */
  spend: number;
  byCampaign: Record<string, number>;
}

const VERSION = process.env.META_GRAPH_VERSION ?? "v23.0";

export async function metaSpend(since: string, until: string): Promise<SpendDay[] | { error: string } | undefined> {
  "use cache";
  const token = process.env.META_ADS_TOKEN;
  const account = process.env.META_AD_ACCOUNT;
  if (!token || !account) return undefined;
  cacheLife("hours");
  const act = account.startsWith("act_") ? account : `act_${account}`;
  const params = new URLSearchParams({
    level: "campaign",
    time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    fields: "campaign_name,spend",
    limit: "500",
    access_token: token,
  });
  const days = new Map<string, SpendDay>();
  let url: string | undefined = `https://graph.facebook.com/${VERSION}/${act}/insights?${params}`;
  try {
    while (url) {
      const res: Response = await fetch(url);
      const body = (await res.json()) as { data?: { date_start: string; campaign_name: string; spend: string }[]; paging?: { next?: string }; error?: { message: string } };
      if (!res.ok || body.error) return { error: body.error?.message ?? `HTTP ${res.status}` };
      for (const row of body.data ?? []) {
        const d = days.get(row.date_start) ?? { date: row.date_start, spend: 0, byCampaign: {} };
        const spend = Number(row.spend) || 0;
        d.spend = Math.round((d.spend + spend) * 100) / 100;
        d.byCampaign[row.campaign_name] = Math.round(((d.byCampaign[row.campaign_name] ?? 0) + spend) * 100) / 100;
        days.set(row.date_start, d);
      }
      url = body.paging?.next;
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}
