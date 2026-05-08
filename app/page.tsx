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
  const multiplayerCount = GAMES.filter(
    (g) => g.players === "multiplayer" || g.players === "both",
  ).length;

  // Bento section: 1 large + 9 normals (10 total)
  const bentoGames = [
    ...featured,
    ...popular.filter((g) => !featured.some((f) => f.slug === g.slug)),
  ].slice(0, 10);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 md:py-10 max-w-[1600px] mx-auto">
      <Hero games={featured.length ? featured : GAMES.slice(0, 3)} />

      {/* Section: bento featured */}
      <SectionHeader emoji="🔥" title="Trending now" subtitle="Hand-picked games everyone's playing" />
      <div className="mb-12">
        <BentoGrid games={bentoGames} />
      </div>

      <RecentlyPlayedRow />

      {fresh.length > 0 && (
        <CategoryRow title="Fresh on Nexplay" games={fresh} emoji="✨" />
      )}

      {/* Multiplayer hero card */}
      <Link
        href="/multiplayer"
        className="block mb-12 rounded-3xl overflow-hidden border border-[var(--border)] group relative card-lift"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)] via-[var(--accent-2)] to-[var(--accent-3)] opacity-90" />
        <div
          className="absolute inset-0 opacity-30 mix-blend-overlay"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.4), transparent 50%), radial-gradient(circle at 90% 70%, rgba(0,0,0,0.4), transparent 60%)",
          }}
        />
        <div className="relative p-6 md:p-10 flex flex-col md:flex-row items-start md:items-center gap-6">
          <div className="text-7xl md:text-8xl drop-shadow-2xl">👥</div>
          <div className="flex-1 text-white">
            <div className="flex items-center gap-2 mb-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
              </span>
              <span className="text-xs uppercase tracking-widest font-bold text-white/90">
                Live multiplayer
              </span>
            </div>
            <h2 className="text-2xl md:text-4xl font-black mb-2 tracking-tight">
              Play head-to-head with friends
            </h2>
            <p className="text-white/85 text-sm md:text-base max-w-2xl">
              Real-time Tic-Tac-Toe over Supabase Realtime. Create a room, share
              the code, play instantly. {multiplayerCount} multiplayer-enabled
              games and growing.
            </p>
          </div>
          <div className="bg-white text-black px-6 py-3 rounded-xl font-bold text-sm shadow-2xl group-hover:scale-105 transition-transform whitespace-nowrap">
            Open multiplayer →
          </div>
        </div>
      </Link>

      <CategoryRow
        title="Popular right now"
        href="/category/arcade"
        emoji="🔥"
        games={popular}
      />

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

      <CategoryRow
        title="Strategy"
        href="/category/strategy"
        emoji="♟️"
        games={gamesByCategory("strategy")}
      />

      {/* All games */}
      <section className="mt-12">
        <SectionHeader
          emoji="🎮"
          title="All games"
          subtitle={`${totalCount} games · play any, save any`}
          right={
            <Link
              href="/category/arcade"
              className="text-sm text-[var(--muted)] hover:text-white"
            >
              Browse →
            </Link>
          }
        />
        <GameGrid games={GAMES} />
      </section>

      {/* Categories panel */}
      <section className="mt-16">
        <SectionHeader emoji="📁" title="Browse by category" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {CATEGORIES.map((cat) => {
            const count = gamesByCategory(cat.slug).length;
            return (
              <Link
                key={cat.slug}
                href={`/category/${cat.slug}`}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 hover:border-[var(--accent)] card-lift group relative overflow-hidden"
              >
                <div className="absolute -right-4 -top-4 text-7xl opacity-10 group-hover:opacity-20 transition-opacity">
                  {cat.emoji}
                </div>
                <div className="relative">
                  <div className="text-3xl mb-2">{cat.emoji}</div>
                  <div className="font-bold">{cat.title}</div>
                  <div className="text-xs text-[var(--muted)] mt-1">
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
  subtitle,
  right,
}: {
  emoji?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 mb-5">
      <div>
        <h2 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-2">
          {emoji && <span>{emoji}</span>} {title}
        </h2>
        {subtitle && (
          <p className="text-sm text-[var(--muted)] mt-1">{subtitle}</p>
        )}
      </div>
      {right}
    </div>
  );
}
