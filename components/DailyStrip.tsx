import Link from "next/link";
import { GameArt } from "./GameArt";
import { getGame } from "@/lib/catalog";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import {
  challengesForDate,
  computeStreak,
  todayKey,
  type DailyChallenge,
} from "@/lib/daily";

export async function DailyStrip() {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const today = todayKey();
  const challenges = challengesForDate(today);

  if (!user) return <DailyTeaser challenges={challenges} />;

  const ids = challenges.map((c) => c.id);
  const { data: todayCompletions } = await supabase
    .from("daily_challenge_completions")
    .select("challenge_id")
    .eq("user_id", user.id)
    .eq("challenge_date", today)
    .in("challenge_id", ids);

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 60);
  const { data: recentRows } = await supabase
    .from("daily_challenge_completions")
    .select("challenge_date")
    .eq("user_id", user.id)
    .gte("challenge_date", since.toISOString().slice(0, 10))
    .order("challenge_date", { ascending: false });

  const completedIds = new Set(
    (todayCompletions ?? []).map((r) => r.challenge_id as string),
  );
  const distinctDates = Array.from(
    new Set((recentRows ?? []).map((r) => r.challenge_date as string)),
  );
  const streak = computeStreak(distinctDates, today);
  const completedCount = challenges.filter((c) => completedIds.has(c.id)).length;
  const flame = streak >= 7 ? "🔥🔥" : streak >= 3 ? "🔥" : streak >= 1 ? "✨" : "🎯";

  return (
    <Link
      href="/daily"
      className="block rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 hover:border-[var(--accent)] transition-colors"
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] uppercase tracking-widest text-[var(--accent)] font-black">
              Daily challenges
            </span>
            <span className="text-[10px] uppercase tracking-widest text-[var(--muted-2)] font-bold">
              · resets at midnight UTC
            </span>
          </div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="text-xl sm:text-2xl font-black tracking-tight">
              {completedCount}/{challenges.length} done today
            </h3>
            {streak > 0 && (
              <span className="text-sm text-[var(--muted)]">
                {flame} {streak}-day streak
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {challenges.map((c) => (
            <ChallengePill key={c.id} challenge={c} done={completedIds.has(c.id)} />
          ))}
        </div>
      </div>
    </Link>
  );
}

function ChallengePill({ challenge, done }: { challenge: DailyChallenge; done: boolean }) {
  const game = getGame(challenge.gameSlug);
  return (
    <div
      className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden ring-1 ${
        done ? "ring-emerald-500/60" : "ring-black/10"
      }`}
      style={{ background: game?.gradient ?? "linear-gradient(135deg,#7c5cff,#ff5cae)" }}
      title={challenge.description}
    >
      <div className="absolute inset-0 flex items-center justify-center scale-[0.6]">
        <GameArt icon={game?.icon} glyph={game?.glyph ?? "🎮"} size="md" />
      </div>
      {done && (
        <span className="absolute inset-0 flex items-center justify-center bg-emerald-500/40 backdrop-blur-[1px] text-white font-black text-2xl">
          ✓
        </span>
      )}
    </div>
  );
}

function DailyTeaser({ challenges }: { challenges: DailyChallenge[] }) {
  return (
    <Link
      href="/login?next=/daily"
      className="block rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 hover:border-[var(--accent)] transition-colors"
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-[var(--accent)] font-black mb-1">
            Daily challenges
          </div>
          <h3 className="text-xl sm:text-2xl font-black tracking-tight">
            Three new challenges every day
          </h3>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            Sign in to track your streak and progress.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {challenges.map((c) => (
            <ChallengePill key={c.id} challenge={c} done={false} />
          ))}
        </div>
      </div>
    </Link>
  );
}
