import { redirect } from "next/navigation";
import { BackButton } from "@/components/BackButton";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { syncAchievements } from "@/lib/achievements-server";
import {
  ACHIEVEMENTS,
  CATEGORY_EMOJI,
  CATEGORY_LABEL,
  progressValue,
  type Achievement,
  type AchievementCategory,
} from "@/lib/achievements";

export const metadata = { title: "Achievements — Nexplay" };
export const dynamic = "force-dynamic";

export default async function AchievementsPage() {
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
  if (!user) redirect("/login?next=/achievements");

  const { stats, unlockedSet } = await syncAchievements(supabase, user.id);

  const total = ACHIEVEMENTS.length;
  const unlockedCount = ACHIEVEMENTS.filter((a) => unlockedSet.has(a.id)).length;
  const progressPct = Math.round((unlockedCount / total) * 100);

  const byCategory = new Map<AchievementCategory, Achievement[]>();
  for (const a of ACHIEVEMENTS) {
    let arr = byCategory.get(a.category);
    if (!arr) {
      arr = [];
      byCategory.set(a.category, arr);
    }
    arr.push(a);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8 md:py-12">
      <div className="mb-4">
        <BackButton fallback="/" />
      </div>

      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-widest text-[var(--muted)] font-bold mb-1">
            Achievements
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            {unlockedCount} / {total} unlocked
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Long-term goals — they unlock automatically as you play.
          </p>
        </div>
        <ProgressDial pct={progressPct} />
      </div>

      <div className="space-y-8">
        {(Object.keys(CATEGORY_LABEL) as AchievementCategory[]).map((cat) => {
          const items = byCategory.get(cat) ?? [];
          if (items.length === 0) return null;
          return (
            <section key={cat}>
              <div className="flex items-baseline gap-2 mb-3 px-1">
                <span>{CATEGORY_EMOJI[cat]}</span>
                <h2 className="text-sm font-black uppercase tracking-wider">
                  {CATEGORY_LABEL[cat]}
                </h2>
                <span className="ml-auto text-xs text-[var(--muted)]">
                  {items.filter((a) => unlockedSet.has(a.id)).length} / {items.length}
                </span>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {items.map((a) => (
                  <AchievementCard
                    key={a.id}
                    achievement={a}
                    unlocked={unlockedSet.has(a.id)}
                    progress={progressValue(a, stats)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function AchievementCard({
  achievement,
  unlocked,
  progress,
}: {
  achievement: Achievement;
  unlocked: boolean;
  progress: number;
}) {
  const pct = Math.min(100, Math.round((progress / achievement.target) * 100));
  return (
    <div
      className={`rounded-2xl border p-4 transition-colors ${
        unlocked
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-[var(--border)] bg-[var(--surface)]"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 ${
            unlocked
              ? "bg-emerald-500/15"
              : "bg-[var(--surface-2)] grayscale opacity-60"
          }`}
        >
          {achievement.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="font-black truncate">{achievement.title}</div>
            {unlocked && (
              <span className="text-[10px] uppercase tracking-widest text-emerald-600 dark:text-emerald-400 font-black">
                ✓ Unlocked
              </span>
            )}
          </div>
          <div className="text-xs text-[var(--muted)]">{achievement.description}</div>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
              <div
                className={`h-full transition-all ${
                  unlocked
                    ? "bg-emerald-500"
                    : "bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)]"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="text-xs text-[var(--muted)] font-mono shrink-0">
              {Math.min(progress, achievement.target).toLocaleString()}
              {" / "}
              {achievement.target.toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProgressDial({ pct }: { pct: number }) {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 flex items-center gap-3">
      <div className="relative w-12 h-12">
        <svg viewBox="0 0 56 56" className="w-12 h-12 -rotate-90">
          <circle
            cx="28"
            cy="28"
            r={r}
            fill="none"
            stroke="var(--surface-2)"
            strokeWidth="6"
          />
          <circle
            cx="28"
            cy="28"
            r={r}
            fill="none"
            stroke="url(#agrad)"
            strokeWidth="6"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all"
          />
          <defs>
            <linearGradient id="agrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--accent)" />
              <stop offset="100%" stopColor="var(--accent-2)" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-xs font-black">
          {pct}%
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-[var(--muted-2)] font-bold">
          Progress
        </div>
        <div className="text-sm font-bold">Keep going</div>
      </div>
    </div>
  );
}

