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
import { DailyStrip } from "@/components/DailyStrip";
import { GameGrid } from "@/components/GameGrid";
import { GameOfTheDay } from "@/components/GameOfTheDay";
import { Hero } from "@/components/Hero";
import { HomeCTA } from "@/components/HomeCTA";
import { JsonLd } from "@/components/JsonLd";
import { RecentlyPlayedRow } from "@/components/RecentlyPlayedRow";
import { RevealSection } from "@/components/RevealSection";
import { WelcomeCard } from "@/components/WelcomeCard";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://nexplay-games.vercel.app";

export default function Home() {
  const featured = featuredGames();
  const popular = popularGames(12);
  const fresh = newGames();
  const totalCount = GAMES.length;

  const bentoGames = [
    ...featured,
    ...popular.filter((g) => !featured.some((f) => f.slug === g.slug)),
  ].slice(0, 10);

  // Top-25 games as an ItemList so Google can surface them in a
  // carousel on the SERP. Includes the featured set first, then
  // popular by play count.
  const listed = bentoGames.concat(
    popular.filter((g) => !bentoGames.some((b) => b.slug === g.slug)),
  ).slice(0, 25);
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Nexplay games",
    numberOfItems: listed.length,
    itemListElement: listed.map((g, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}/game/${g.slug}`,
      name: g.title,
    })),
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 md:py-7 max-w-[1500px] mx-auto">
      <JsonLd data={itemListSchema} />
      <WelcomeCard gameCount={totalCount} />
      <Hero games={featured.length ? featured : GAMES.slice(0, 3)} />

      <RevealSection>
        <div className="mb-8">
          <DailyStrip />
        </div>
      </RevealSection>

      <RevealSection>
        <GameOfTheDay />
      </RevealSection>

      <RevealSection>
        <div id="trending" className="scroll-mt-20">
          <SectionHeader emoji="🔥" title="Trending now" />
          <div className="mb-8">
            <BentoGrid games={bentoGames} />
          </div>
        </div>
      </RevealSection>

      <RecentlyPlayedRow />

      {fresh.length > 0 && (
        <RevealSection>
          <CategoryRow title="New on Nexplay" games={fresh} emoji="✨" />
        </RevealSection>
      )}

      <RevealSection>
        <CategoryRow title="Popular" emoji="🔥" games={popular} href="/category/arcade" />
      </RevealSection>

      <RevealSection>
        <CategoryRow title="2 Player" emoji="👥" games={gamesByCategory("2-player")} href="/category/2-player" />
      </RevealSection>

      <RevealSection>
        <CategoryRow title="Puzzle" emoji="🧩" games={gamesByCategory("puzzle")} href="/category/puzzle" />
      </RevealSection>

      <RevealSection>
        <HomeCTA />
      </RevealSection>

      <RevealSection>
        <CategoryRow title="Action" emoji="⚔️" games={gamesByCategory("action")} href="/category/action" />
      </RevealSection>

      <RevealSection>
        <CategoryRow title="Arcade" emoji="🕹️" games={gamesByCategory("arcade")} href="/category/arcade" />
      </RevealSection>

      <RevealSection>
        <CategoryRow title="Strategy" emoji="♟️" games={gamesByCategory("strategy")} href="/category/strategy" />
      </RevealSection>

      <RevealSection>
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
      </RevealSection>

      <RevealSection>
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
      </RevealSection>
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
