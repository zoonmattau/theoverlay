import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "The Overlay. The market has an opinion. We have the data.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The brand faces: without them ImageResponse falls back to one light weight and the card reads thin.
const font = (f: string) => readFile(join(process.cwd(), "assets/og", f));
const fonts = Promise.all([font("Archivo-Black.ttf"), font("Inter-ExtraBold.ttf"), font("Inter-Medium.ttf")]);

const LIME = "#c6f24e";
const INK = "#14161a";

export default async function Image() {
  const [archivo, interBold, interMedium] = await fonts;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: `radial-gradient(ellipse 700px 420px at 80% 30%, rgba(198,242,78,0.14), rgba(198,242,78,0) 70%), ${INK}`, color: "#ffffff", padding: "64px 72px", fontFamily: "Inter" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: "Archivo", fontSize: 52, letterSpacing: 1 }}>
          <span>THE</span>
          <span style={{ background: LIME, color: INK, padding: "0 16px" }}>OVERLAY</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontFamily: "Archivo", fontSize: 76, lineHeight: 1.06, letterSpacing: -2 }}>
          <span style={{ whiteSpace: "nowrap" }}>The market has an opinion.</span>
          <span style={{ color: LIME }}>We have the data.</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 32, fontWeight: 500, color: "#b9bec8" }}>Every runner rated and priced, every race.</span>
          <span style={{ fontSize: 30, fontWeight: 800, color: LIME }}>theoverlay.com.au</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Archivo", data: archivo, weight: 900, style: "normal" },
        { name: "Inter", data: interBold, weight: 800, style: "normal" },
        { name: "Inter", data: interMedium, weight: 500, style: "normal" },
      ],
    },
  );
}
