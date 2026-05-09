import type { Game } from "@/lib/types";
import { GameCard } from "./GameCard";

/**
 * Mixed-size featured grid inspired by Poki's varied tiles. Two large
 * 2x2 tiles flank a wide 2x1 banner, with the rest as standard squares
 * filling the remaining slots. The grid uses dense auto-placement so
 * ordinary cards slot into gaps automatically.
 */
export function BentoGrid({ games }: { games: Game[] }) {
  if (games.length === 0) return null;

  const [a, b, c, ...rest] = games;

  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4 auto-rows-[1fr]"
      style={{ gridAutoFlow: "row dense" }}
    >
      {/* Featured 1 — large square */}
      <GameCard game={a} size="large" index={0} />

      {/* Featured 2 — wide */}
      {b && <GameCard game={b} size="wide" index={1} />}

      {/* Squares fill remaining slots */}
      {c && <GameCard game={c} index={2} />}

      {rest.slice(0, 11).map((g, i) => (
        <GameCard key={g.slug} game={g} index={i + 3} />
      ))}
    </div>
  );
}
