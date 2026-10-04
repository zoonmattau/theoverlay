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
/**
 * Campaigns in the same ad account that belong to another project, left out of
 * every Overlay figure: "Free Websites Sep 2026" (10 to 11 Sep, $18) was the
 * user's other business, not The Overlay.
 */
const OTHER_PROJECTS = /free websites/i;

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
        if (OTHER_PROJECTS.test(row.campaign_name)) continue;
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

/** One ad over a window: its spend and reach, and the utm tag its link carries ("problem/mate"), which is how sign-ups are matched to it. */
export interface AdRow {
  id: string;
  ad: string;
  campaign: string;
  status: string;
  /** "campaign/content" from the ad's link, lower case; the ad's name when the link has none. */
  tag: string;
  spend: number;
  impressions: number;
  clicks: number;
}

/**
 * Spend by ad over a window, with each ad's tag read off its own link (archived
 * and deleted ads too, so last month's spend still finds its ad). Cached an hour.
 */
export async function metaAds(since: string, until: string): Promise<AdRow[] | { error: string } | undefined> {
  "use cache";
  const token = process.env.META_ADS_TOKEN;
  const account = process.env.META_AD_ACCOUNT;
  if (!token || !account) return undefined;
  cacheLife("hours");
  const act = account.startsWith("act_") ? account : `act_${account}`;
  const get = async (path: string, params: Record<string, string>) => {
    const rows: Record<string, unknown>[] = [];
    let url: string | undefined = `https://graph.facebook.com/${VERSION}/${act}/${path}?${new URLSearchParams({ ...params, limit: "500", access_token: token })}`;
    while (url) {
      const res: Response = await fetch(url);
      const body = (await res.json()) as { data?: Record<string, unknown>[]; paging?: { next?: string }; error?: { message: string } };
      if (!res.ok || body.error) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      rows.push(...(body.data ?? []));
      url = body.paging?.next;
    }
    return rows;
  };
  try {
    const [insights, ads] = await Promise.all([
      get("insights", { level: "ad", time_range: JSON.stringify({ since, until }), fields: "ad_id,ad_name,campaign_name,spend,impressions,inline_link_clicks" }),
      get("ads", {
        fields: "name,effective_status,creative{url_tags,object_story_spec{link_data{link},video_data{call_to_action}},asset_feed_spec{link_urls}}",
        filtering: JSON.stringify([{ field: "effective_status", operator: "IN", value: ["ACTIVE", "PAUSED", "ARCHIVED", "DELETED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "DISAPPROVED", "WITH_ISSUES", "IN_PROCESS", "PENDING_REVIEW"] }]),
      }),
    ]);
    const info = new Map<string, { status: string; tag?: string }>();
    for (const a of ads as { id: string; effective_status: string; creative?: { url_tags?: string; object_story_spec?: { link_data?: { link?: string }; video_data?: { call_to_action?: { value?: { link?: string } } } }; asset_feed_spec?: { link_urls?: { website_url?: string }[] } } }[]) {
      const c = a.creative;
      const link = c?.object_story_spec?.link_data?.link ?? c?.object_story_spec?.video_data?.call_to_action?.value?.link ?? c?.asset_feed_spec?.link_urls?.[0]?.website_url ?? "";
      let q: URLSearchParams | undefined;
      try {
        q = new URL(link).searchParams;
      } catch {
        q = c?.url_tags ? new URLSearchParams(c.url_tags) : undefined;
      }
      const campaign = q?.get("utm_campaign"), content = q?.get("utm_content");
      info.set(a.id, { status: a.effective_status, tag: campaign ? `${campaign}/${content ?? ""}`.toLowerCase() : undefined });
    }
    return (insights as { ad_id: string; ad_name: string; campaign_name: string; spend: string; impressions: string; inline_link_clicks?: string }[]).filter((r) => !OTHER_PROJECTS.test(r.campaign_name)).map((r) => ({
      id: r.ad_id,
      ad: r.ad_name,
      campaign: r.campaign_name,
      status: info.get(r.ad_id)?.status ?? "DELETED",
      tag: info.get(r.ad_id)?.tag ?? r.ad_name.toLowerCase(),
      spend: Math.round(Number(r.spend) * 100) / 100,
      impressions: Number(r.impressions) || 0,
      clicks: Number(r.inline_link_clicks) || 0,
    }));
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
