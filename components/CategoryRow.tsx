import Link from "next/link";
import type { Game } from "@/lib/types";
import { GameCard } from "./GameCard";

export function CategoryRow({
  title,
  href,
  games,
  emoji,
}: {
  title: string;
  href?: string;
  games: Game[];
  emoji?: string;
}) {
  if (games.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-lg md:text-xl font-black flex items-center gap-2">
          {emoji && <span className="text-xl">{emoji}</span>}
          {title}
        </h2>
        {href && (
          <Link
            href={href}
            className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] font-medium transition-colors"
          >
            View all →
          </Link>
        )}
      </div>

      <div className="flex gap-3 md:gap-4 overflow-x-auto pb-2 -mx-4 px-4 no-scrollbar snap-x snap-mandatory">
        {games.map((game, i) => (
          <div
            key={game.slug}
            className="flex-shrink-0 w-40 sm:w-44 md:w-48 lg:w-52 snap-start"
          >
            <GameCard game={game} index={i} />
          </div>
        ))}
      </div>
    </section>
  );
}
