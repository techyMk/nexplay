import type { MetadataRoute } from "next";

/**
 * robots.txt for crawlers. Allows everything except authenticated
 * routes (no point indexing personalised pages) and the API.
 */
export default function robots(): MetadataRoute.Robots {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://nexplay-games.vercel.app";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/auth/",
          "/admin",
          "/profile",
          "/friends",
          "/settings",
          "/achievements",
          "/multiplayer/*/*", // active rooms — codes are not stable URLs
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
