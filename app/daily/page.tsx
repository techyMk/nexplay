import Link from "next/link";
import { redirect } from "next/navigation";
import { BackButton } from "@/components/BackButton";
import { GameArt } from "@/components/GameArt";
import { getGame } from "@/lib/catalog";
import type { Game } from "@/lib/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import {
  challengesForDate,
  computeStreak,
  todayKey,
  type DailyChallenge,
} from "@/lib/daily";

export const metadata = { title: "Daily Challenges — Nexplay" };
export const dynamic = "force-dynamic";

type CompletionRow = { challenge_id: string; score: number };

export default async function DailyPage() {
  if (!isSupabaseConfigured) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-6">
          <h1 className="text-xl font-bold mb-2">Supabase setup required</h1>
        </div>
      </div>
    );
  }
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/daily");

  const today = todayKey();
  const challenges = challengesForDate(today);

  const ids = challenges.map((c) => c.id);
  const { data: todayCompletions } = await supabase
    .from("daily_challenge_completions")
    .select("challenge_id, score")
    .eq("user_id", user.id)
    .eq("challenge_date", today)
    .in("challenge_id", ids);

  const completedToday = new Map(
    (todayCompletions ?? []).map((r: CompletionRow) => [r.challenge_id, r.score] as const),
  );

  // Distinct dates for streak calculation. Pull last 60 days max.
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 60);
  const { data: recentRows } = await supabase
    .from("daily_challenge_completions")
    .select("challenge_date")
    .eq("user_id", user.id)
    .gte("challenge_date", since.toISOString().slice(0, 10))
    .order("challenge_date", { ascending: false });

  const distinctDates = Array.from(
    new Set((recentRows ?? []).map((r) => r.challenge_date as string)),
  );
  const streak = computeStreak(distinctDates, today);

  const completedCount = challenges.filter((c) => completedToday.has(c.id)).length;
  const allDone = completedCount === challenges.length;

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8 md:py-12">
      <div className="mb-4">
        <BackButton fallback="/" />
      </div>

      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-widest text-[var(--muted)] font-bold mb-1">
            Daily Challenges
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            {prettyDate(today)}
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Three new challenges every day · resets at midnight UTC
          </p>
        </div>
        <StreakBadge streak={streak} />
      </div>

      {allDone && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 mb-5 text-sm text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-2">
          <span className="text-xl">🎉</span>
          All three done! Come back tomorrow for a new set.
        </div>
      )}

      <div className="grid gap-4">
        {challenges.map((c, i) => (
          <ChallengeCard
            key={c.id}
            challenge={c}
            index={i}
            done={completedToday.has(c.id)}
            doneScore={completedToday.get(c.id)}
          />
        ))}
      </div>

      <div className="mt-8 text-xs text-[var(--muted)] text-center">
        Challenges complete automatically when you submit a qualifying score.
        No retries needed — beat the threshold once and it sticks.
      </div>
    </div>
  );
}

function ChallengeCard({
  challenge,
  index,
  done,
  doneScore,
}: {
  challenge: DailyChallenge;
  index: number;
  done: boolean;
  doneScore?: number;
}) {
  const game = getGame(challenge.gameSlug);
  return (
    <div
      className={`rounded-2xl border p-4 sm:p-5 flex flex-col sm:flex-row gap-4 transition-colors ${
        done
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-[var(--border)] bg-[var(--surface)]"
      }`}
    >
      {game && <ChallengeThumb game={game} />}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 mb-1">
          <span className="text-[10px] uppercase tracking-widest text-[var(--muted-2)] font-bold mt-0.5">
            Challenge {index + 1}
          </span>
          {done && (
            <span className="text-[10px] uppercase tracking-widest text-emerald-600 dark:text-emerald-400 font-bold mt-0.5 inline-flex items-center gap-1">
              ✓ Done {typeof doneScore === "number" && `· ${doneScore.toLocaleString()}`}
            </span>
          )}
        </div>
        <div className="font-black text-lg leading-tight">{challenge.title}</div>
        <div className="text-sm text-[var(--muted)] mt-0.5">{challenge.description}</div>
      </div>
      <div className="flex items-center justify-end shrink-0">
        {done ? (
          <span className="px-4 py-2 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-sm font-bold">
            Completed
          </span>
        ) : game ? (
          <Link
            href={`/game/${game.slug}`}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] text-white text-sm font-bold hover:scale-[1.03] transition-transform"
          >
            Play
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function ChallengeThumb({ game }: { game: Game }) {
  return (
    <Link
      href={`/game/${game.slug}`}
      className="relative block w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden shrink-0 mx-auto sm:mx-0 ring-1 ring-black/5"
      style={{ background: game.gradient }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <GameArt icon={game.icon} glyph={game.glyph} size="md" />
      </div>
    </Link>
  );
}

function StreakBadge({ streak }: { streak: number }) {
  const flame = streak >= 7 ? "🔥🔥" : streak >= 3 ? "🔥" : "✨";
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 flex items-center gap-3">
      <div className="text-3xl" aria-hidden>
        {flame}
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-[var(--muted-2)] font-bold">
          Streak
        </div>
        <div className="text-xl font-black leading-tight">
          {streak} {streak === 1 ? "day" : "days"}
        </div>
      </div>
    </div>
  );
}

function prettyDate(key: string): string {
  // key is YYYY-MM-DD
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
