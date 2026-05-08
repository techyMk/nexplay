"use client";

import { GAMES } from "@/lib/catalog";
import { useRecentlyPlayed } from "@/lib/recentlyPlayed";
import { CategoryRow } from "./CategoryRow";

export function RecentlyPlayedRow() {
  const slugs = useRecentlyPlayed();
  const games = slugs
    .map((slug) => GAMES.find((g) => g.slug === slug))
    .filter((g): g is NonNullable<typeof g> => Boolean(g));

  if (games.length === 0) return null;

  return <CategoryRow title="Recently played" games={games} emoji="⏱️" />;
}
