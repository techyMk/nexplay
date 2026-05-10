import Link from "next/link";
import { redirect } from "next/navigation";
import { BackButton } from "@/components/BackButton";
import { isAdminEmail, isAdminUnlocked } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import {
  createAdminClient,
  isAdminClientConfigured,
} from "@/lib/supabase/admin";
import { GAMES } from "@/lib/catalog";
import { avatarSrc } from "@/lib/avatars";
import { AdminTabs } from "./AdminTabs";

export const metadata = { title: "Admin — Nexplay" };
export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const supabase = await createClient();
  if (!supabase) redirect("/login");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");

  // Hard server-side guard: anyone not on the admin email goes home.
  // The cookie alone is never enough — both checks must pass.
  const unlocked = await isAdminUnlocked(user.email);
  if (!isAdminEmail(user.email) || !unlocked) {
    redirect("/profile");
  }

  if (!isAdminClientConfigured) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8 md:py-12">
        <div className="mb-4">
          <BackButton fallback="/profile" />
        </div>
        <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-6">
          <h1 className="text-xl font-bold mb-2">Service-role key missing</h1>
          <p className="text-sm text-[var(--muted)] mb-3">
            Admin reads bypass RLS, which requires the Supabase service-role
            key. Add this to{" "}
            <code className="px-1 py-0.5 rounded bg-[var(--surface-2)] font-mono text-xs">
              .env.local
            </code>{" "}
            and restart the dev server:
          </p>
          <pre className="bg-[var(--surface)] mt-1 p-3 rounded text-xs overflow-x-auto">{`SUPABASE_SERVICE_ROLE_KEY=your_service_role_key`}</pre>
          <p className="text-xs text-[var(--muted)] mt-2">
            Find it in{" "}
            <a
              className="text-[var(--accent)] hover:underline"
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noreferrer"
            >
              Supabase Dashboard
            </a>{" "}
            → Project Settings → API → service_role key. Don&apos;t commit it.
          </p>
        </div>
      </div>
    );
  }

  const admin = createAdminClient()!;
  const { tab: rawTab } = await searchParams;
  const tab =
    rawTab === "feedback" || rawTab === "users" || rawTab === "games"
      ? rawTab
      : "overview";

  // Pull stats in parallel.
  const [
    { count: profileCount },
    { count: scoresCount },
    { count: dailyCount },
    { count: achievementsCount },
    { count: friendshipsCount },
    { count: feedbackTotal },
    { count: feedbackNew },
    { data: recentFeedback },
    { data: topProfiles },
    { data: scoresByGame },
    { data: ratingsByGame },
    { data: recentSignups },
  ] = await Promise.all([
    admin.from("profiles").select("*", { count: "exact", head: true }),
    admin.from("scores").select("*", { count: "exact", head: true }),
    admin
      .from("daily_challenge_completions")
      .select("*", { count: "exact", head: true }),
    admin
      .from("achievements_unlocked")
      .select("*", { count: "exact", head: true }),
    admin
      .from("friendships")
      .select("*", { count: "exact", head: true })
      .eq("status", "accepted"),
    admin.from("feedback").select("*", { count: "exact", head: true }),
    admin
      .from("feedback")
      .select("*", { count: "exact", head: true })
      .eq("status", "new"),
    admin
      .from("feedback")
      .select("id, user_id, email, subject, body, status, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("scores")
      .select("user_id")
      .limit(2000) // bounded sample so a sudden spike doesn't kill the request
      .order("created_at", { ascending: false }),
    admin.from("scores").select("game_slug"),
    admin.from("game_ratings").select("game_slug, rating"),
    admin
      .from("profiles")
      .select("id, display_name, avatar_emoji, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  // Top players by play volume from the sampled scores
  const playsByUser = new Map<string, number>();
  for (const r of (topProfiles ?? []) as { user_id: string }[]) {
    playsByUser.set(r.user_id, (playsByUser.get(r.user_id) ?? 0) + 1);
  }
  const topUserIds = [...playsByUser.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const { data: topUserProfiles } = topUserIds.length
    ? await admin
        .from("profiles")
        .select("id, display_name, avatar_emoji")
        .in(
          "id",
          topUserIds.map(([id]) => id),
        )
    : { data: [] as { id: string; display_name: string | null; avatar_emoji: string | null }[] };
  const topProfilesById = new Map(
    (topUserProfiles ?? []).map((p) => [p.id, p] as const),
  );
  const topPlayers = topUserIds.map(([id, plays]) => ({
    id,
    plays,
    name: topProfilesById.get(id)?.display_name ?? "Unknown",
    avatar: topProfilesById.get(id)?.avatar_emoji ?? "liam",
  }));

  // Look up emails for the recent-signup rows. listUsers is paginated
  // by Supabase (default 50/page) and we only display the latest 20
  // signups, so one page is plenty. Service-role only — safe here.
  const { data: authPage } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 50,
  });
  const emailById = new Map<string, string>(
    (authPage?.users ?? []).map((u) => [u.id, u.email ?? ""] as const),
  );
  const recentSignupsEnriched: RecentSignup[] = (recentSignups ?? []).map(
    (s) => ({
      ...s,
      email: emailById.get(s.id) ?? null,
    }),
  );

  // Per-game aggregates
  const playsBySlug = new Map<string, number>();
  for (const r of (scoresByGame ?? []) as { game_slug: string }[]) {
    playsBySlug.set(r.game_slug, (playsBySlug.get(r.game_slug) ?? 0) + 1);
  }
  const ratingAgg = new Map<string, { sum: number; n: number }>();
  for (const r of (ratingsByGame ?? []) as { game_slug: string; rating: number }[]) {
    const cur = ratingAgg.get(r.game_slug) ?? { sum: 0, n: 0 };
    cur.sum += r.rating;
    cur.n += 1;
    ratingAgg.set(r.game_slug, cur);
  }
  const perGame = GAMES.map((g) => {
    const a = ratingAgg.get(g.slug);
    return {
      slug: g.slug,
      title: g.title,
      glyph: g.glyph,
      gradient: g.gradient,
      plays: playsBySlug.get(g.slug) ?? 0,
      ratingAvg: a && a.n > 0 ? a.sum / a.n : null,
      ratingCount: a?.n ?? 0,
    };
  }).sort((a, b) => b.plays - a.plays);

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 md:py-12">
      <div className="mb-4 flex items-center justify-between gap-3">
        <BackButton fallback="/profile" />
        <form action="/api/admin/lock" method="post">
          <button
            type="submit"
            title="Clear admin elevation and return to /profile. Your regular login stays signed in — coming back into the panel will require another email OTP."
            className="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-500 text-xs font-bold hover:bg-red-500 hover:text-white transition-colors"
          >
            🔒 Lock admin
          </button>
        </form>
      </div>

      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-widest text-[var(--accent)] font-black mb-1">
            Admin
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            Control panel
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Stats, feedback, and player activity. Service-role read access —
            don&apos;t share screenshots of feedback bodies that contain user PII.
          </p>
        </div>
      </div>

      <AdminTabs
        active={tab}
        overview={
          <Overview
            stats={{
              profiles: profileCount ?? 0,
              scores: scoresCount ?? 0,
              dailyCompletions: dailyCount ?? 0,
              achievements: achievementsCount ?? 0,
              friendships: friendshipsCount ?? 0,
              feedbackTotal: feedbackTotal ?? 0,
              feedbackNew: feedbackNew ?? 0,
            }}
            recentSignups={recentSignupsEnriched}
          />
        }
        feedback={
          <FeedbackList
            rows={(recentFeedback ?? []) as FeedbackRow[]}
            unread={feedbackNew ?? 0}
            total={feedbackTotal ?? 0}
          />
        }
        users={<TopPlayers rows={topPlayers} />}
        games={<GameStats rows={perGame} />}
      />
    </div>
  );
}

type Stats = {
  profiles: number;
  scores: number;
  dailyCompletions: number;
  achievements: number;
  friendships: number;
  feedbackTotal: number;
  feedbackNew: number;
};

type RecentSignup = {
  id: string;
  display_name: string | null;
  avatar_emoji: string | null;
  created_at: string;
  email?: string | null;
};

type FeedbackRow = {
  id: string;
  user_id: string | null;
  email: string | null;
  subject: string;
  body: string;
  status: "new" | "seen" | "resolved";
  created_at: string;
};

function Overview({
  stats,
  recentSignups,
}: {
  stats: Stats;
  recentSignups: RecentSignup[];
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatCard label="Players" value={stats.profiles} emoji="👤" />
        <StatCard label="Scores recorded" value={stats.scores} emoji="🏁" />
        <StatCard label="Daily completions" value={stats.dailyCompletions} emoji="🎯" />
        <StatCard label="Achievements unlocked" value={stats.achievements} emoji="🏆" />
        <StatCard label="Friendships" value={stats.friendships} emoji="🤝" />
        <StatCard
          label="Feedback received"
          value={stats.feedbackTotal}
          emoji="💬"
          badge={stats.feedbackNew > 0 ? `${stats.feedbackNew} new` : undefined}
        />
      </div>
      <section>
        <h2 className="text-sm font-black uppercase tracking-wider mb-2 px-1">
          Recent signups
        </h2>
        {recentSignups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
            No signups yet.
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
            {recentSignups.map((s) => {
              // The avatar_emoji column stores one of three things:
              //   - a preset slug like "lucas" → /public/avatars/lucas.svg
              //   - a custom upload URL (Supabase storage)
              //   - a literal emoji glyph (legacy)
              // avatarSrc() resolves the first two to a loadable src;
              // anything else (or null) returns null and falls through
              // to the text/initial path.
              const src = avatarSrc(s.avatar_emoji);
              const a = s.avatar_emoji?.trim();
              const fallbackInitial =
                (s.display_name?.trim()?.[0] ?? s.email?.trim()?.[0] ?? "?")
                  .toUpperCase();
              return (
                <div key={s.id} className="flex items-center gap-3 p-3">
                  <span className="w-9 h-9 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-sm font-bold text-[var(--muted)] overflow-hidden shrink-0">
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={src}
                        alt=""
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : a ? (
                      a
                    ) : (
                      fallbackInitial
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">
                      {s.display_name || "Unnamed player"}
                    </div>
                    <div className="text-xs text-[var(--muted)] truncate">
                      {s.email || (
                        <span className="font-mono">{s.id.slice(0, 8)}…</span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-[var(--muted)] shrink-0 text-right">
                    {new Date(s.created_at).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  emoji,
  badge,
}: {
  label: string;
  value: number;
  emoji: string;
  badge?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 relative">
      <div className="text-2xl mb-1">{emoji}</div>
      <div className="text-2xl font-black tabular-nums">
        {value.toLocaleString()}
      </div>
      <div className="text-[11px] uppercase tracking-wider text-[var(--muted)] font-bold">
        {label}
      </div>
      {badge && (
        <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-black">
          {badge}
        </span>
      )}
    </div>
  );
}

function FeedbackList({
  rows,
  unread,
  total,
}: {
  rows: FeedbackRow[];
  unread: number;
  total: number;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] p-10 text-center text-[var(--muted)]">
        No feedback yet.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="text-sm text-[var(--muted)]">
        Showing the most recent <b className="text-[var(--foreground)]">{rows.length}</b> of{" "}
        <b className="text-[var(--foreground)]">{total}</b> messages
        {unread > 0 && (
          <>
            {" "}— <span className="text-red-500 font-bold">{unread} unread</span>
          </>
        )}
      </div>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
        {rows.map((f) => (
          <FeedbackItem key={f.id} row={f} />
        ))}
      </div>
    </div>
  );
}

function FeedbackItem({ row }: { row: FeedbackRow }) {
  const tone =
    row.status === "new"
      ? "bg-red-500/15 text-red-500"
      : row.status === "seen"
        ? "bg-amber-500/15 text-amber-500"
        : "bg-emerald-500/15 text-emerald-500";
  return (
    <details className="group">
      <summary className="flex items-center gap-3 p-3 cursor-pointer hover:bg-[var(--surface-2)] transition-colors list-none">
        <span
          className={`text-[10px] uppercase tracking-widest font-black px-2 py-0.5 rounded-full ${tone}`}
        >
          {row.status}
        </span>
        <span className="font-bold truncate flex-1">{row.subject}</span>
        <span className="text-xs text-[var(--muted)] shrink-0">
          {new Date(row.created_at).toLocaleDateString()}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="w-3.5 h-3.5 text-[var(--muted)] transition-transform group-open:rotate-180"
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="px-3 pb-4 space-y-3">
        <div className="text-xs text-[var(--muted)] flex flex-wrap gap-x-4 gap-y-1">
          {row.email && (
            <span>
              From:{" "}
              <a
                className="text-[var(--accent)] hover:underline"
                href={`mailto:${row.email}?subject=Re:%20${encodeURIComponent(row.subject)}`}
              >
                {row.email}
              </a>
            </span>
          )}
          {row.user_id && (
            <span className="font-mono">User: {row.user_id.slice(0, 8)}…</span>
          )}
          <span>{new Date(row.created_at).toLocaleString()}</span>
        </div>
        <div className="text-sm whitespace-pre-wrap leading-relaxed bg-[var(--surface-2)] rounded-xl p-3">
          {row.body}
        </div>
        <form action="/api/admin/feedback/status" method="post" className="flex gap-2">
          <input type="hidden" name="id" value={row.id} />
          {row.status !== "seen" && (
            <button
              type="submit"
              name="status"
              value="seen"
              className="px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-600 text-xs font-bold hover:bg-amber-500 hover:text-white transition-colors"
            >
              Mark seen
            </button>
          )}
          {row.status !== "resolved" && (
            <button
              type="submit"
              name="status"
              value="resolved"
              className="px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-600 text-xs font-bold hover:bg-emerald-500 hover:text-white transition-colors"
            >
              Mark resolved
            </button>
          )}
          {row.status !== "new" && (
            <button
              type="submit"
              name="status"
              value="new"
              className="px-3 py-1.5 rounded-lg bg-[var(--surface-2)] text-[var(--muted)] text-xs font-bold hover:bg-[var(--surface-3)] transition-colors"
            >
              Reopen
            </button>
          )}
        </form>
      </div>
    </details>
  );
}

function TopPlayers({
  rows,
}: {
  rows: { id: string; name: string; avatar: string; plays: number }[];
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] p-10 text-center text-[var(--muted)]">
        Not enough play data yet.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
      {rows.map((r, i) => (
        <div key={r.id} className="flex items-center gap-3 p-3">
          <span className="w-7 text-center font-black text-[var(--muted)]">
            {i + 1}
          </span>
          <span className="w-9 h-9 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-sm">
            {r.avatar}
          </span>
          <span className="flex-1 truncate font-bold">{r.name}</span>
          <span className="text-sm text-[var(--muted)]">
            <b className="text-[var(--foreground)]">{r.plays}</b> recent plays
          </span>
        </div>
      ))}
    </div>
  );
}

function GameStats({
  rows,
}: {
  rows: {
    slug: string;
    title: string;
    glyph: string;
    gradient: string;
    plays: number;
    ratingAvg: number | null;
    ratingCount: number;
  }[];
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
      {rows.map((r) => (
        <div key={r.slug} className="flex items-center gap-3 p-3">
          <span
            className="w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0"
            style={{ background: r.gradient }}
          >
            {r.glyph}
          </span>
          <Link
            href={`/leaderboard/${r.slug}`}
            className="flex-1 min-w-0 font-bold truncate hover:text-[var(--accent)]"
          >
            {r.title}
          </Link>
          <span className="text-sm text-[var(--muted)] tabular-nums whitespace-nowrap">
            {r.plays.toLocaleString()} plays
          </span>
          <span className="text-sm tabular-nums whitespace-nowrap min-w-[5rem] text-right">
            {r.ratingAvg != null ? (
              <>
                ★ <b>{r.ratingAvg.toFixed(1)}</b>{" "}
                <span className="text-[var(--muted)]">({r.ratingCount})</span>
              </>
            ) : (
              <span className="text-[var(--muted)]">—</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
