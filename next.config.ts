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
};

export default nextConfig;
