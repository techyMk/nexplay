import Link from "next/link";
import { notFound } from "next/navigation";
import { GAMES, getCategory, getGame } from "@/lib/catalog";
import { GameFrame } from "@/components/GameFrame";
import { GameCard } from "@/components/GameCard";

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

export default async function GamePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const game = getGame(slug);
  if (!game) notFound();

  const related = GAMES.filter(
    (g) =>
      g.slug !== game.slug &&
      g.categories.some((c) => game.categories.includes(c)),
  ).slice(0, 6);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 md:py-10">
      <div className="grid lg:grid-cols-[1fr_320px] gap-6 mb-10">
        <div>
          <GameFrame game={game} />
        </div>

        <aside className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h1 className="text-2xl font-black mb-1">{game.title}</h1>
          <p className="text-sm text-[var(--muted)] mb-4">{game.short}</p>

          <div className="flex items-center gap-3 text-sm mb-4">
            <span className="flex items-center gap-1 text-yellow-400">
              ⭐ {game.rating.toFixed(1)}
            </span>
            <span className="text-[var(--muted)]">
              {game.plays.toLocaleString()} plays
            </span>
          </div>

          <Link
            href={`/leaderboard/${game.slug}`}
            className="block w-full text-center mb-4 px-4 py-2.5 rounded-xl bg-[var(--surface-2)] hover:bg-[var(--accent)] transition-colors text-sm font-bold"
          >
            🏆 Leaderboard
          </Link>

          <div className="space-y-3 text-sm">
            <div>
              <div className="text-[var(--muted)] text-xs uppercase tracking-wider mb-1">
                Controls
              </div>
              <div className="flex flex-wrap gap-1.5">
                {game.controls.map((c) => (
                  <span
                    key={c}
                    className="px-2 py-1 rounded-md bg-[var(--surface-2)] text-xs"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[var(--muted)] text-xs uppercase tracking-wider mb-1">
                Players
              </div>
              <div className="capitalize">{game.players}</div>
            </div>

            <div>
              <div className="text-[var(--muted)] text-xs uppercase tracking-wider mb-1">
                Categories
              </div>
              <div className="flex flex-wrap gap-1.5">
                {game.categories.map((catSlug) => {
                  const c = getCategory(catSlug);
                  if (!c) return null;
                  return (
                    <Link
                      key={catSlug}
                      href={`/category/${catSlug}`}
                      className="px-2 py-1 rounded-md bg-[var(--surface-2)] text-xs hover:bg-[var(--accent)] transition-colors"
                    >
                      {c.emoji} {c.title}
                    </Link>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-[var(--muted)] text-xs uppercase tracking-wider mb-1">
                About
              </div>
              <p className="text-sm leading-relaxed">{game.description}</p>
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
            {related.map((g) => (
              <GameCard key={g.slug} game={g} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
