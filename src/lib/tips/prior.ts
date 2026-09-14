import type { Period } from "./stats";

/**
 * The model's record before the site went live, kept by hand while it was
 * being developed. This is what the Results section shows. Edit the figures
 * here; nothing else reads them.
 */
export const PRIOR_RECORD: { to: string; windows: Record<Period, { tips: number; units: number; roi: number }> } = {
  /** Last day the hand-kept record covers, yyyy-mm-dd. */
  to: "2026-08-31",
  windows: {
    week: { tips: 84, units: 1.1, roi: 0.017 },
    month: { tips: 231, units: 10.1, roi: 0.043 },
    year: { tips: 2353, units: 65.9, roi: 0.028 },
    all: { tips: 2353, units: 65.9, roi: 0.028 },
  },
};

/** The day the site's own ledger started recording live calls. */
export const RECORDING_FROM = "2026-09-14";
