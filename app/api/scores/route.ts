import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GAMES } from "@/lib/catalog";
import {
  challengesForDate,
  challengesSatisfiedBy,
  todayKey,
} from "@/lib/daily";
import { syncAchievements } from "@/lib/achievements-server";

const VALID_SLUGS = new Set(GAMES.map((g) => g.slug));
const MAX_SCORE = 10_000_000;

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { game_slug, score } =
    (body as { game_slug?: string; score?: number }) ?? {};

  if (typeof game_slug !== "string" || !VALID_SLUGS.has(game_slug)) {
    console.error("[POST /api/scores] invalid game_slug", { game_slug });
    return NextResponse.json(
      { error: `Invalid game_slug: "${game_slug}"` },
      { status: 400 },
    );
  }
  if (
    typeof score !== "number" ||
    !Number.isFinite(score) ||
    score < 0 ||
    score > MAX_SCORE
  ) {
    console.error("[POST /api/scores] invalid score", { score });
    return NextResponse.json({ error: "Invalid score" }, { status: 400 });
  }

  const { error } = await supabase.from("scores").insert({
    user_id: user.id,
    game_slug,
    score: Math.floor(score),
  });

  if (error) {
    console.error("[POST /api/scores] supabase insert failed", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      user_id: user.id,
      game_slug,
      score,
    });
    return NextResponse.json(
      { error: `${error.code ?? "DB"}: ${error.message}` },
      { status: 500 },
    );
  }

  // Mark any daily challenges this score satisfies. Uses upsert so a
  // user replaying after they've already qualified is a no-op rather
  // than an error. Failures here aren't fatal — score is already saved.
  const today = todayKey();
  const todays = challengesForDate(today);
  const satisfied = challengesSatisfiedBy(todays, game_slug, score);
  let completed: string[] = [];
  if (satisfied.length > 0) {
    const { error: dcErr } = await supabase
      .from("daily_challenge_completions")
      .upsert(
        satisfied.map((c) => ({
          user_id: user.id,
          challenge_date: today,
          challenge_id: c.id,
          score: Math.floor(score),
        })),
        { onConflict: "user_id,challenge_date,challenge_id", ignoreDuplicates: true },
      );
    if (dcErr) {
      console.error("[POST /api/scores] daily completions upsert failed", {
        message: dcErr.message,
        code: dcErr.code,
      });
    } else {
      completed = satisfied.map((c) => c.id);
    }
  }

  // Achievement sync — recompute stats and unlock anything new. Failures
  // here are non-fatal; the score is already saved.
  let achievements: string[] = [];
  try {
    const result = await syncAchievements(supabase, user.id);
    achievements = result.newlyUnlocked;
  } catch (e) {
    console.error("[POST /api/scores] achievement sync failed", e);
  }

  return NextResponse.json({ ok: true, completed, achievements });
}
