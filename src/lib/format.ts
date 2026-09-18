/** Bookmaker prices are quoted to two decimals under $10 and one above. */
export function price(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n) || n <= 0) return "—";
  if (n >= 100) return `$${Math.round(n)}`;
  if (n >= 10) return `$${n.toFixed(1)}`;
  return `$${n.toFixed(2)}`;
}

/** A rated price with its win chance, e.g. "$4.50 · 22%". */
export function priceWithChance(p: number | undefined, prob: number | undefined): string {
  if (p === undefined || !prob) return price(p);
  return `${price(p)} · ${percent(prob)}`;
}

export function percent(n: number | undefined, dp = 0): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(dp)}%`;
}

/** Probability-point edges: +5.0% for a $4 rating against a $5 market. */
export function signedPercent(n: number | undefined, dp = 1): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  const v = n * 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(dp)}%`;
}

export function money(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1000) return `$${Math.round(n / 1000)}k`;
  return `$${n}`;
}

export function jumpTime(iso: string | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Australia/Sydney",
  });
}

export function longDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export const TAG_LABEL = {
  top_overlay: "Overlay of the Day",
  prime_overlay: "Prime Overlay",
  way_overlay: "Way Overlay",
  long_overlay: "Long Overlay",
  bet: "Bet",
  lay: "Lay",
} as const;

export const TAG_BLURB = {
  top_overlay: "Biggest edge on the card",
  prime_overlay: "A bet with an edge of five points or more",
  way_overlay: "A bet at $21 or more, way over the odds",
  long_overlay: "Best edge at an each-way price",
  bet: "Market longer than our price",
  lay: "Market shorter than our price",
} as const;
