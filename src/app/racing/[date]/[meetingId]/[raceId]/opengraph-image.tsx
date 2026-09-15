import { ImageResponse } from "next/og";

import { longDate, price } from "@/lib/format";
import { getRaceCard } from "@/lib/model/source";

export const alt = "The Overlay race card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#14161a", LIME = "#c6f24e", BLUE = "#1f6fd6", RED = "#d93636", PAPER = "#f5f7f2", SOFT = "#b9bec8";

/**
 * The share image for a race: track, race, the top four with rated against
 * market, and the calls in their colours. Calls only show once the day's
 * card is released, so a link shared early gives nothing away.
 */
export default async function Image({ params }: { params: Promise<{ date: string; meetingId: string; raceId: string }> }) {
  const p = await params;
  const card = await getRaceCard(p.date, decodeURIComponent(p.meetingId), decodeURIComponent(p.raceId));
  const meeting = card?.meeting;
  const race = card?.race;
  const run = Boolean(race?.result?.length);
  const top = race ? race.runners.filter((r) => r.rank && !r.scratched).sort((a, b) => a.rank! - b.rank!).slice(0, 4) : [];
  const released = card?.card.released ?? false;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: INK, color: PAPER, padding: 56, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 22, height: 22, borderRadius: 5, background: LIME }} />
            <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.5 }}>The Overlay</div>
          </div>
          <div style={{ fontSize: 24, color: SOFT }}>{race ? longDate(p.date) : ""}</div>
        </div>

        {race && meeting ? (
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 24 }}>
              <div style={{ fontSize: 54, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1.5 }}>{`${meeting.track} Race ${race.raceNumber}`}</div>
              <div style={{ fontSize: 24, color: SOFT, marginTop: 6 }}>{`${race.name}, ${race.distance}m${race.goingText ? `, ${race.goingText}` : ""}${run ? ", result in" : ""}`}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 22, gap: 8 }}>
              {top.map((r) => {
                const call = released ? (r.prime ? { bg: LIME, fg: INK, text: "PRIME" } : r.signal === "back" ? { bg: BLUE, fg: PAPER, text: "BET" } : r.signal === "lay" ? { bg: RED, fg: PAPER, text: "LAY" } : null) : null;
                const won = run && race.result![0] === r.tabNumber;
                return (
                  <div key={r.tabNumber} style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 28, background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: "7px 16px" }}>
                    <div style={{ width: 46, height: 46, borderRadius: 8, background: PAPER, color: INK, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 26 }}>{r.tabNumber}</div>
                    <div style={{ fontWeight: 700, flex: 1 }}>{won ? `${r.horseName}  ·  won` : r.horseName}</div>
                    {released && <div style={{ color: SOFT, fontSize: 26 }}>{`rated ${price(r.ratedPrice)}`}</div>}
                    {r.marketPrice ? <div style={{ fontWeight: 800, minWidth: 110, textAlign: "right" }}>{price(r.marketPrice)}</div> : null}
                    {call && <div style={{ background: call.bg, color: call.fg, borderRadius: 6, padding: "4px 12px", fontSize: 20, fontWeight: 800, letterSpacing: 1 }}>{call.text}</div>}
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 22, color: SOFT, marginTop: "auto" }}>{released ? "Our top four, rated price against the market. theoverlay.com.au" : "Ratings and calls release on race morning. theoverlay.com.au"}</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1 }}>
            <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>The market has an opinion.</div>
            <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, color: LIME }}>We have the data.</div>
          </div>
        )}
      </div>
    ),
    { ...size },
  );
}
