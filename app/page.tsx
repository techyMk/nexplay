import Link from "next/link";
import {
  CATEGORIES,
  GAMES,
  featuredGames,
  gamesByCategory,
  newGames,
  popularGames,
} from "@/lib/catalog";
import { CategoryPills } from "@/components/CategoryPills";
import { CategoryRow } from "@/components/CategoryRow";
import { GameGrid } from "@/components/GameGrid";
import { Hero } from "@/components/Hero";
import { RecentlyPlayedRow } from "@/components/RecentlyPlayedRow";

export default function Home() {
  const featured = featuredGames();
  const heroGame = featured[0] ?? GAMES[0];
  const popular = popularGames(10);
  const fresh = newGames();

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 md:py-10">
      <Hero game={heroGame} />

      <CategoryPills />

      <RecentlyPlayedRow />

      <CategoryRow title="Popular right now" games={popular} emoji="🔥" />

      {fresh.length > 0 && (
        <CategoryRow title="New on Nexplay" games={fresh} emoji="✨" />
      )}

      <CategoryRow
        title="2 Player"
        href="/category/2-player"
        emoji="👥"
        games={gamesByCategory("2-player")}
      />

      <CategoryRow
        title="Puzzle"
        href="/category/puzzle"
        emoji="🧩"
        games={gamesByCategory("puzzle")}
      />

      <CategoryRow
        title="Action"
        href="/category/action"
        emoji="⚔️"
        games={gamesByCategory("action")}
      />

      <CategoryRow
        title="Arcade"
        href="/category/arcade"
        emoji="🕹️"
        games={gamesByCategory("arcade")}
      />

      <section className="mt-12">
        <h2 className="text-xl md:text-2xl font-black mb-4">All games</h2>
        <GameGrid games={GAMES} />
      </section>

      <section className="mt-16">
        <h2 className="text-xl md:text-2xl font-black mb-4">
          Browse by category
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.slug}
              href={`/category/${cat.slug}`}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 hover:border-[var(--accent)] hover:-translate-y-0.5 transition-all"
            >
              <div className="text-3xl mb-2">{cat.emoji}</div>
              <div className="font-bold">{cat.title}</div>
              <div className="text-xs text-[var(--muted)] mt-1">
                {cat.description}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
