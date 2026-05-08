import Link from "next/link";
import {
  CATEGORIES,
  GAMES,
  featuredGames,
  gamesByCategory,
  newGames,
  popularGames,
} from "@/lib/catalog";
import { BentoGrid } from "@/components/BentoGrid";
import { CategoryRow } from "@/components/CategoryRow";
import { GameGrid } from "@/components/GameGrid";
import { Hero } from "@/components/Hero";
import { RecentlyPlayedRow } from "@/components/RecentlyPlayedRow";

export default function Home() {
  const featured = featuredGames();
  const popular = popularGames(12);
  const fresh = newGames();
  const totalCount = GAMES.length;

  const bentoGames = [
    ...featured,
    ...popular.filter((g) => !featured.some((f) => f.slug === g.slug)),
  ].slice(0, 10);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 md:py-7 max-w-[1500px] mx-auto">
      <Hero games={featured.length ? featured : GAMES.slice(0, 3)} />

      <SectionHeader emoji="🔥" title="Trending now" />
      <div className="mb-8">
        <BentoGrid games={bentoGames} />
      </div>

      <RecentlyPlayedRow />

      {fresh.length > 0 && (
        <CategoryRow title="New on Nexplay" games={fresh} emoji="✨" />
      )}

      <Link
        href="/multiplayer"
        className="block mb-8 rounded-2xl overflow-hidden group relative card-lift shadow-sm hover:shadow-md"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)] via-[var(--accent-2)] to-[var(--accent-3)] opacity-95" />
        <div
          className="absolute inset-0 opacity-30 mix-blend-overlay"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.4), transparent 50%)",
          }}
        />
        <div className="relative p-5 md:p-7 flex flex-col md:flex-row items-start md:items-center gap-4">
          <div className="text-5xl">👥</div>
          <div className="flex-1 text-white">
            <div className="flex items-center gap-2 mb-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
              </span>
              <span className="text-[10px] uppercase tracking-widest font-bold">
                Live
              </span>
            </div>
            <h2 className="text-xl md:text-2xl font-black tracking-tight mb-1">
              Play with friends in real time
            </h2>
            <p className="text-white/85 text-sm">
              Skribbl, Tic-Tac-Toe, and more — share a code, no install.
            </p>
          </div>
          <div className="bg-white text-[var(--foreground)] px-5 py-2.5 rounded-lg font-bold text-sm shadow group-hover:scale-105 transition-transform whitespace-nowrap">
            Open lobby →
          </div>
        </div>
      </Link>

      <CategoryRow title="Popular" emoji="🔥" games={popular} href="/category/arcade" />
      <CategoryRow title="2 Player" emoji="👥" games={gamesByCategory("2-player")} href="/category/2-player" />
      <CategoryRow title="Puzzle" emoji="🧩" games={gamesByCategory("puzzle")} href="/category/puzzle" />
      <CategoryRow title="Action" emoji="⚔️" games={gamesByCategory("action")} href="/category/action" />
      <CategoryRow title="Arcade" emoji="🕹️" games={gamesByCategory("arcade")} href="/category/arcade" />
      <CategoryRow title="Strategy" emoji="♟️" games={gamesByCategory("strategy")} href="/category/strategy" />

      <section className="mt-10">
        <SectionHeader
          emoji="🎮"
          title="All games"
          right={
            <span className="text-sm text-[var(--muted)] font-medium">
              {totalCount} total
            </span>
          }
        />
        <GameGrid games={GAMES} />
      </section>

      <section className="mt-10">
        <SectionHeader emoji="📁" title="Browse by category" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {CATEGORIES.map((cat) => {
            const count = gamesByCategory(cat.slug).length;
            return (
              <Link
                key={cat.slug}
                href={`/category/${cat.slug}`}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 hover:border-[var(--accent)] card-lift relative overflow-hidden shadow-sm"
              >
                <div className="absolute -right-3 -top-3 text-5xl opacity-15">
                  {cat.emoji}
                </div>
                <div className="relative">
                  <div className="text-xl mb-1">{cat.emoji}</div>
                  <div className="font-bold text-sm">{cat.title}</div>
                  <div className="text-xs text-[var(--muted)] mt-0.5">
                    {count} {count === 1 ? "game" : "games"}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function SectionHeader({
  emoji,
  title,
  right,
}: {
  emoji?: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h2 className="text-lg md:text-xl font-black tracking-tight flex items-center gap-2">
        {emoji && <span className="text-xl">{emoji}</span>} {title}
      </h2>
      {right}
    </div>
  );
}
