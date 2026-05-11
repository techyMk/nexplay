import type { MetadataRoute } from "next";
import { CATEGORIES, GAMES } from "@/lib/catalog";

/**
 * Sitemap for crawlers. Served at /sitemap.xml by Next.js's metadata
 * file convention. Lists the home page, every game page, every
 * category page, every leaderboard, and the static informational
 * pages. `lastModified` is set to the current build's start time so
 * crawlers see the latest deploy time.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://nexplay-games.vercel.app";
  const now = new Date();

  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${base}/multiplayer`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/daily`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/search`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: `${base}/guide`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    ...CATEGORIES.map((c) => ({
      url: `${base}/category/${c.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...GAMES.map((g) => ({
      url: `${base}/game/${g.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      // Featured / new games rank slightly higher.
      priority: g.featured ? 0.9 : g.isNew ? 0.85 : 0.7,
    })),
    ...GAMES.map((g) => ({
      url: `${base}/leaderboard/${g.slug}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.5,
    })),
  ];
}
