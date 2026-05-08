import type { Game } from "@/lib/types";
import { GameCard } from "./GameCard";

export function GameGrid({ games }: { games: Game[] }) {
  if (games.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] py-16 text-center text-[var(--muted)]">
        No games found.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
      {games.map((game) => (
        <GameCard key={game.slug} game={game} />
      ))}
    </div>
  );
}
