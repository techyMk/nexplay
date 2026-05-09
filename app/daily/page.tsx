import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { BackButton } from "@/components/BackButton";
import { GameArt } from "@/components/GameArt";
import { getGame } from "@/lib/catalog";
import { otherParty } from "@/lib/social";
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

  const { data: myProfile } = await supabase
    .from("profiles")
    .select("display_name, avatar_emoji")
    .eq("id", user.id)
    .maybeSingle();
  const myAvatar = myProfile?.avatar_emoji ?? "liam";

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

  // ---- Friend leaderboard for today ----------------------------------------
  const { data: friendships } = await supabase
    .from("friendships")
    .select("user_a, user_b")
    .eq("status", "accepted")
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);
  const friendIds = (friendships ?? []).map((f) => otherParty(f, user.id));

  type FriendStat = {
    user_id: string;
    name: string;
    avatar: string;
    todayDone: number;
    streak: number;
    completedIds: Set<string>;
  };
  let friendStats: FriendStat[] = [];

  if (friendIds.length > 0) {
    const sinceKey = since.toISOString().slice(0, 10);
    const [{ data: profiles }, { data: friendCompletions }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, display_name, avatar_emoji")
        .in("id", friendIds),
      supabase
        .from("daily_challenge_completions")
        .select("user_id, challenge_date, challenge_id")
        .in("user_id", friendIds)
        .gte("challenge_date", sinceKey),
    ]);

    const profileById = new Map(
      (profiles ?? []).map((p) => [p.id, p] as const),
    );
    // Group completions by user
    const byUser = new Map<
      string,
      { dates: Set<string>; todayIds: Set<string> }
    >();
    for (const r of friendCompletions ?? []) {
      const uid = r.user_id as string;
      const date = r.challenge_date as string;
      const cid = r.challenge_id as string;
      let entry = byUser.get(uid);
      if (!entry) {
        entry = { dates: new Set(), todayIds: new Set() };
        byUser.set(uid, entry);
      }
      entry.dates.add(date);
      if (date === today && ids.includes(cid)) entry.todayIds.add(cid);
    }

    friendStats = friendIds.map((fid) => {
      const profile = profileById.get(fid);
      const stats = byUser.get(fid);
      return {
        user_id: fid,
        name: profile?.display_name ?? "Player",
        avatar: profile?.avatar_emoji ?? "liam",
        todayDone: stats?.todayIds.size ?? 0,
        streak: stats ? computeStreak(Array.from(stats.dates), today) : 0,
        completedIds: stats?.todayIds ?? new Set(),
      };
    });

    // Sort: most done today, then highest streak, then name.
    friendStats.sort(
      (a, b) =>
        b.todayDone - a.todayDone ||
        b.streak - a.streak ||
        a.name.localeCompare(b.name),
    );
  }

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
            friendsDone={friendStats.filter((f) => f.completedIds.has(c.id))}
          />
        ))}
      </div>

      {friendStats.length > 0 && (
        <div className="mt-8">
          <div className="flex items-baseline gap-2 mb-2 px-1">
            <span>👥</span>
            <h2 className="text-sm font-black uppercase tracking-wider">
              Friends today
            </h2>
            <span className="ml-auto text-xs text-[var(--muted)]">
              {friendStats.filter((f) => f.todayDone > 0).length} active
            </span>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
            <FriendRow
              key="me"
              avatar={myAvatar}
              name="You"
              todayDone={completedCount}
              total={challenges.length}
              streak={streak}
              highlight
            />
            {friendStats.map((f) => (
              <FriendRow
                key={f.user_id}
                avatar={f.avatar}
                name={f.name}
                todayDone={f.todayDone}
                total={challenges.length}
                streak={f.streak}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 text-xs text-[var(--muted)] text-center">
        Challenges complete automatically when you submit a qualifying score.
        No retries needed — beat the threshold once and it sticks.
      </div>
    </div>
  );
}

function FriendRow({
  avatar,
  name,
  todayDone,
  total,
  streak,
  highlight = false,
}: {
  avatar: string;
  name: string;
  todayDone: number;
  total: number;
  streak: number;
  highlight?: boolean;
}) {
  const allDone = todayDone === total && total > 0;
  return (
    <div
      className={`flex items-center gap-3 p-3 ${
        highlight ? "bg-[var(--accent)]/5" : ""
      }`}
    >
      <Avatar value={avatar} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="font-bold truncate">
          {name}
          {highlight && (
            <span className="ml-2 text-xs text-[var(--accent)] font-medium">(you)</span>
          )}
        </div>
        <div className="text-xs text-[var(--muted)]">
          {todayDone}/{total} today · {streak}-day streak
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`w-2.5 h-2.5 rounded-full ${
              i < todayDone
                ? "bg-emerald-500"
                : "bg-[var(--surface-2)] border border-[var(--border)]"
            }`}
          />
        ))}
        {allDone && <span className="ml-1 text-base">🎉</span>}
      </div>
    </div>
  );
}

function ChallengeCard({
  challenge,
  index,
  done,
  doneScore,
  friendsDone,
}: {
  challenge: DailyChallenge;
  index: number;
  done: boolean;
  doneScore?: number;
  friendsDone: { user_id: string; name: string; avatar: string }[];
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
        {friendsDone.length > 0 && (
          <div className="flex items-center gap-2 mt-2">
            <div className="flex -space-x-2">
              {friendsDone.slice(0, 5).map((f) => (
                <div
                  key={f.user_id}
                  className="rounded-full ring-2 ring-[var(--surface)]"
                  title={`${f.name} completed this`}
                >
                  <Avatar value={f.avatar} size="sm" />
                </div>
              ))}
            </div>
            <span className="text-xs text-[var(--muted)]">
              {friendsDone.length === 1
                ? `${friendsDone[0].name} did it too`
                : `${friendsDone.length} friends did it`}
            </span>
          </div>
        )}
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
