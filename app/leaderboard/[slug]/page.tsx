import Link from "next/link";
import { notFound } from "next/navigation";
import { GAMES, getGame } from "@/lib/catalog";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { GameArt } from "@/components/GameArt";
import { BackButton } from "@/components/BackButton";

export function generateStaticParams() {
  return GAMES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const game = getGame(slug);
  return {
    title: game ? `${game.title} leaderboard — Nexplay` : "Leaderboard — Nexplay",
  };
}

type Row = {
  user_id: string;
  score: number;
  created_at: string;
  display_name: string | null;
  avatar_emoji: string | null;
};

export default async function LeaderboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const game = getGame(slug);
  if (!game) notFound();

  let rows: Row[] = [];
  let currentUserId: string | null = null;

  if (isSupabaseConfigured) {
    const supabase = await createClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      currentUserId = user?.id ?? null;

      const { data } = await supabase
        .from("top_scores")
        .select("user_id, score, created_at, display_name, avatar_emoji")
        .eq("game_slug", slug)
        .order("score", { ascending: false })
        .limit(50);
      rows = (data as Row[] | null) ?? [];
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8 md:py-12">
      <div className="mb-4">
        <BackButton fallback={`/game/${game.slug}`} />
      </div>
      <div className="flex items-center gap-4 mb-6">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: game.gradient }}
        >
          <GameArt icon={game.icon} glyph={game.glyph} size="sm" />
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-[var(--muted)]">
            Leaderboard
          </div>
          <h1 className="text-2xl md:text-3xl font-black">{game.title}</h1>
        </div>
        <Link
          href={`/game/${game.slug}`}
          className="ml-auto px-4 py-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] text-white font-bold text-sm hover:scale-105 transition-transform"
        >
          ▶ Play
        </Link>
      </div>

      {!isSupabaseConfigured ? (
        <SetupBanner />
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] p-10 text-center text-[var(--muted)]">
          No scores yet — be the first!
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
          {rows.map((row, i) => (
            <div
              key={row.user_id}
              className={`flex items-center gap-4 px-4 py-3 border-b border-[var(--border)] last:border-0 ${
                row.user_id === currentUserId ? "bg-[var(--accent)]/10" : ""
              }`}
            >
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center font-black text-sm ${
                  i === 0
                    ? "bg-yellow-500/20 text-yellow-400"
                    : i === 1
                      ? "bg-zinc-300/20 text-zinc-300"
                      : i === 2
                        ? "bg-amber-700/30 text-amber-400"
                        : "bg-[var(--surface-2)] text-[var(--muted)]"
                }`}
              >
                {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
              </div>
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex items-center justify-center text-base">
                {row.avatar_emoji || "🎮"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">
                  {row.display_name || "Player"}
                  {row.user_id === currentUserId && (
                    <span className="ml-2 text-xs text-[var(--accent)] font-medium">
                      (you)
                    </span>
                  )}
                </div>
                <div className="text-xs text-[var(--muted)]">
                  {new Date(row.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="text-2xl font-black">
                {row.score.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SetupBanner() {
  return (
    <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-6">
      <h2 className="font-bold mb-1">Leaderboards are offline</h2>
      <p className="text-sm text-[var(--muted)]">
        Configure Supabase to enable global leaderboards. See{" "}
        <Link href="/login" className="text-[var(--accent)]">
          /login
        </Link>{" "}
        for setup instructions.
      </p>
    </div>
  );
}
