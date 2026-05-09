import Link from "next/link";
import { notFound } from "next/navigation";
import { GAMES, getCategory, getGame } from "@/lib/catalog";
import { GameFrame } from "@/components/GameFrame";
import { GameCard } from "@/components/GameCard";
import { GameArt } from "@/components/GameArt";
import { BackButton } from "@/components/BackButton";
import { RatingWidget } from "@/components/RatingWidget";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { compactNumber } from "@/lib/format";

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
  if (!game) return {};
  return {
    title: `${game.title} — Play free on Nexplay`,
    description: game.description,
  };
}

async function fetchStats(slug: string) {
  if (!isSupabaseConfigured) {
    return { plays: 0, avgRating: null, ratingCount: 0, userRating: null, userId: null };
  }
  const supabase = await createClient();
  if (!supabase) {
    return { plays: 0, avgRating: null, ratingCount: 0, userRating: null, userId: null };
  }

  const [{ count: plays }, { data: ratingsRows }, { data: { user } }] =
    await Promise.all([
      supabase
        .from("game_plays")
        .select("*", { count: "exact", head: true })
        .eq("game_slug", slug),
      supabase.from("game_ratings").select("rating").eq("game_slug", slug),
      supabase.auth.getUser(),
    ]);

  const ratings = (ratingsRows ?? []).map((r) => r.rating as number);
  const ratingCount = ratings.length;
  const avgRating =
    ratingCount > 0
      ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratingCount) * 10) / 10
      : null;

  let userRating: number | null = null;
  if (user) {
    const { data } = await supabase
      .from("game_ratings")
      .select("rating")
      .eq("user_id", user.id)
      .eq("game_slug", slug)
      .maybeSingle();
    userRating = (data?.rating as number | undefined) ?? null;
  }

  return {
    plays: plays ?? 0,
    avgRating,
    ratingCount,
    userRating,
    userId: user?.id ?? null,
  };
}

export default async function GamePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const game = getGame(slug);
  if (!game) notFound();

  const stats = await fetchStats(slug);
  const isMultiplayer = game.players === "multiplayer" || game.players === "both";
  const related = GAMES.filter(
    (g) =>
      g.slug !== game.slug &&
      g.categories.some((c) => game.categories.includes(c)),
  ).slice(0, 6);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 md:py-10">
      <div className="mb-4">
        <BackButton fallback="/" />
      </div>

      {/* Title bar */}
      <div className="flex items-start gap-4 mb-6">
        <div
          className="hidden sm:flex w-16 h-16 rounded-2xl items-center justify-center shadow-lg"
          style={{ background: game.gradient }}
        >
          <GameArt icon={game.icon} glyph={game.glyph} size="sm" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1 text-xs">
            {game.categories.slice(0, 2).map((catSlug) => {
              const c = getCategory(catSlug);
              if (!c) return null;
              return (
                <Link
                  key={catSlug}
                  href={`/category/${catSlug}`}
                  className="px-2 py-0.5 rounded-md bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                >
                  {c.emoji} {c.title}
                </Link>
              );
            })}
            {game.isNew && (
              <span className="px-2 py-0.5 rounded-md bg-[var(--accent-2)] text-white font-bold uppercase tracking-wider">
                New
              </span>
            )}
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            {game.title}
          </h1>
          <p className="text-[var(--muted)] mt-1">{game.short}</p>
        </div>
        <div className="hidden md:flex flex-col items-end gap-0.5 text-right shrink-0">
          <div className="text-2xl font-black text-amber-500 leading-none">
            {stats.avgRating !== null ? `★ ${stats.avgRating.toFixed(1)}` : "★ —"}
          </div>
          <div className="text-xs text-[var(--muted)]">
            {stats.ratingCount === 0
              ? "No ratings yet"
              : `${stats.ratingCount} ${stats.ratingCount === 1 ? "rating" : "ratings"}`}
          </div>
          <div className="text-xs text-[var(--muted)] mt-1">
            {stats.plays === 0
              ? "Just launched"
              : `${compactNumber(stats.plays)} ${stats.plays === 1 ? "play" : "plays"}`}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6 mb-10">
        <div>
          <GameFrame game={game} />
        </div>

        <aside className="space-y-4">
          <Link
            href={`/leaderboard/${game.slug}`}
            className="block rounded-2xl p-5 border border-[var(--border)] bg-gradient-to-br from-[var(--surface)] to-[var(--surface-2)] hover:border-[var(--accent)] card-lift"
          >
            <div className="flex items-center gap-3">
              <div className="text-3xl">🏆</div>
              <div>
                <div className="font-black">Leaderboard</div>
                <div className="text-xs text-[var(--muted)]">
                  See top scores worldwide
                </div>
              </div>
            </div>
          </Link>

          {isMultiplayer && (
            <Link
              href={`/multiplayer/${game.slug}`}
              className="block rounded-2xl p-5 relative overflow-hidden card-lift"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)]" />
              <div className="relative flex items-center gap-3 text-white">
                <div className="text-3xl">👥</div>
                <div>
                  <div className="font-black">Play with a friend</div>
                  <div className="text-xs text-white/85">
                    Real-time, share a code
                  </div>
                </div>
              </div>
            </Link>
          )}

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
            <div>
              <div className="text-[var(--muted)] text-[10px] uppercase tracking-widest mb-1.5 font-bold">
                Rate this game
              </div>
              <RatingWidget
                gameSlug={game.slug}
                initialUserRating={stats.userRating}
                isAuthenticated={Boolean(stats.userId)}
              />
            </div>

            <div>
              <div className="text-[var(--muted)] text-[10px] uppercase tracking-widest mb-1.5 font-bold">
                Controls
              </div>
              <div className="flex flex-wrap gap-1.5">
                {game.controls.map((c) => (
                  <span
                    key={c}
                    className="px-2.5 py-1 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-xs font-medium"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[var(--muted)] text-[10px] uppercase tracking-widest mb-1.5 font-bold">
                Mode
              </div>
              <div className="text-sm capitalize">
                {game.players === "both"
                  ? "Single + multiplayer"
                  : game.players}
              </div>
            </div>

            <div>
              <div className="text-[var(--muted)] text-[10px] uppercase tracking-widest mb-1.5 font-bold">
                About
              </div>
              <p className="text-sm leading-relaxed text-[var(--muted)]">
                {game.description}
              </p>
            </div>
          </div>
        </aside>
      </div>

      {related.length > 0 && (
        <section>
          <h2 className="text-xl md:text-2xl font-black mb-4">
            You might also like
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 md:gap-4">
            {related.map((g, i) => (
              <GameCard key={g.slug} game={g} index={i} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
