import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/api/", "/auth/", "/invite", "/reset"] },
      // AI crawlers are welcome: the FAQ and race pages are written to be quoted.
      { userAgent: ["GPTBot", "ChatGPT-User", "ClaudeBot", "PerplexityBot", "Google-Extended"], allow: "/" },
    ],
    sitemap: "https://theoverlay.com.au/sitemap.xml",
    host: "https://theoverlay.com.au",
  };
}
