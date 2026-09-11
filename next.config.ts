import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Card data is stable within the hour, so we cache the model output rather
  // than re-running it (and re-spending Form King credits) per request.
  cacheComponents: true,
  // The dev server is also opened over 127.0.0.1 and the LAN address; without
  // this Next blocks its own client bundle and HMR from those origins.
  allowedDevOrigins: ["127.0.0.1", "192.168.0.11"],
};

export default nextConfig;
