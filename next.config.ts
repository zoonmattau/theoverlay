import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Card data is stable within the hour, so we cache the model output rather
  // than re-running it (and re-spending Form King credits) per request.
  cacheComponents: true,
  // When this deployment was built: a card build from an older deployment
  // (still serving a tab opened before a deploy) stands down (store.ts, newestDeploy).
  env: { OVERLAY_BUILT_AT: String(Date.now()) },
  // The dev server is also opened over 127.0.0.1 and the LAN address; without
  // this Next blocks its own client bundle and HMR from those origins.
  allowedDevOrigins: ["127.0.0.1", "192.168.0.11"],
  // /welcome, the ad landing page (6 Oct 2026), is gone: 9% of its visitors went on to a
  // second page against 52% from home (12 Oct). Old ad links land on home with their tags.
  async redirects() {
    return [{ source: "/welcome", destination: "/", permanent: false }];
  },
};

export default nextConfig;
