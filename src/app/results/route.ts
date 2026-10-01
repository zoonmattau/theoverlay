import { RESULTS_SHEET } from "@/lib/social";

/** theoverlay.com.au/results: the one address for the results, wherever the sheet lives. */
export function GET() {
  return Response.redirect(RESULTS_SHEET, 307);
}
