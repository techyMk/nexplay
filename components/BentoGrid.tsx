import type { Game } from "@/lib/types";
import { GameCard } from "./GameCard";

/**
 * Mixed-size featured grid (Poki-inspired). The first game gets a 2x2
 * "large" tile; subsequent games fill the remaining slots as default
 * squares. On small screens it gracefully degrades to a uniform grid.
 */
export function BentoGrid({ games }: { games: Game[] }) {
  if (games.length === 0) return null;
  const [first, ...rest] = games;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4 auto-rows-[1fr]">
      <GameCard game={first} size="large" index={0} />
      {rest.slice(0, 9).map((g, i) => (
        <GameCard key={g.slug} game={g} index={i + 1} />
      ))}
    </div>
  );
}
