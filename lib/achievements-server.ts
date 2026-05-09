// Server-only helpers for computing and persisting achievements.
// Imported by the score API, friend-action server actions, and the
// /achievements page. Each call queries the user's relevant stats,
// diffs against already-unlocked rows, and inserts any new ones.

import { challengesForDate, computeStreak, todayKey } from "./daily";
import {
  unlockedIds,
  type AchievementStats,
} from "./achievements";
import type { createClient } from "./supabase/server";

type SupabaseClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;

export async function fetchAchievementStats(
  supabase: SupabaseClient,
  userId: string,
): Promise<AchievementStats> {
  const today = todayKey();

  const [
    { count: totalPlays },
    { data: top },
    { count: friendCount },
    { data: completions },
  ] = await Promise.all([
    supabase
      .from("scores")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase.from("top_scores").select("game_slug, score").eq("user_id", userId),
    supabase
      .from("friendships")
      .select("*", { count: "exact", head: true })
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .eq("status", "accepted"),
    (() => {
      const since = new Date();
      since.setUTCDate(since.getUTCDate() - 365);
      return supabase
        .from("daily_challenge_completions")
        .select("challenge_date, challenge_id")
        .eq("user_id", userId)
        .gte("challenge_date", since.toISOString().slice(0, 10));
    })(),
  ]);

  const bestScores: Record<string, number> = {};
  for (const r of top ?? []) bestScores[r.game_slug as string] = r.score as number;

  // Distinct completion dates + per-date challenge sets
  const datesSet = new Set<string>();
  const byDate = new Map<string, Set<string>>();
  for (const r of completions ?? []) {
    const date = r.challenge_date as string;
    datesSet.add(date);
    let s = byDate.get(date);
    if (!s) {
      s = new Set();
      byDate.set(date, s);
    }
    s.add(r.challenge_id as string);
  }

  const totalDailyCompletions = (completions ?? []).length;
  const streak = computeStreak(Array.from(datesSet), today);

  // A "slam day" = the user completed every challenge that was active on
  // that date. Need to look up each date's challenge set.
  let slamDays = 0;
  for (const [date, completedIds] of byDate.entries()) {
    const expected = challengesForDate(date).map((c) => c.id);
    if (expected.length > 0 && expected.every((id) => completedIds.has(id))) {
      slamDays++;
    }
  }

  return {
    totalPlays: totalPlays ?? 0,
    bestScores,
    friendCount: friendCount ?? 0,
    streak,
    totalDailyCompletions,
    slamDays,
  };
}

export async function syncAchievements(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  stats: AchievementStats;
  unlockedSet: Set<string>;
  newlyUnlocked: string[];
}> {
  const stats = await fetchAchievementStats(supabase, userId);
  const computed = unlockedIds(stats);

  const { data: existing } = await supabase
    .from("achievements_unlocked")
    .select("achievement_id")
    .eq("user_id", userId);
  const existingSet = new Set(
    (existing ?? []).map((r) => r.achievement_id as string),
  );

  const newlyUnlocked = computed.filter((id) => !existingSet.has(id));

  if (newlyUnlocked.length > 0) {
    const { error } = await supabase.from("achievements_unlocked").upsert(
      newlyUnlocked.map((id) => ({
        user_id: userId,
        achievement_id: id,
      })),
      { onConflict: "user_id,achievement_id", ignoreDuplicates: true },
    );
    if (error) {
      console.error("[syncAchievements] upsert failed", {
        message: error.message,
        code: error.code,
      });
    }
  }

  return {
    stats,
    unlockedSet: new Set([...existingSet, ...newlyUnlocked]),
    newlyUnlocked,
  };
}
