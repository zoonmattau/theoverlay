import { ImageResponse } from "next/og";

export const alt = "The Overlay. The market has an opinion. We have the data.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#14161a", color: "#ffffff", padding: 72, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: "#c6f24e" }} />
          <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>The Overlay</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>The market has an opinion.</div>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, color: "#c6f24e" }}>We have the data.</div>
        </div>
        <div style={{ fontSize: 28, color: "#b9bec8" }}>Benchmark ratings, rated prices and bet or lay calls for every runner in Australian racing.</div>
      </div>
    ),
    size,
  );
}
