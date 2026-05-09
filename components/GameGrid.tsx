import type { Game } from "@/lib/types";
import { GameCard } from "./GameCard";

export function GameGrid({ games }: { games: Game[] }) {
  if (games.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] py-12 text-center text-[var(--muted)] text-sm">
        No games found.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
      {games.map((game, i) => (
        <GameCard key={game.slug} game={game} index={i} />
      ))}
    </div>
  );
}
