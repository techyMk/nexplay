import Link from "next/link";
import type { Game } from "@/lib/types";

export type GameCardSize = "default" | "large" | "wide";

export function GameCard({
  game,
  size = "default",
  priority = false,
}: {
  game: Game;
  size?: GameCardSize;
  priority?: boolean;
}) {
  const isLarge = size === "large";
  const isWide = size === "wide";

  return (
    <Link
      href={`/game/${game.slug}`}
      prefetch={priority}
      className={`group relative block rounded-2xl overflow-hidden border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-[var(--accent-glow)] ${
        isWide ? "col-span-2 row-span-2" : ""
      }`}
    >
      <div
        className={`relative w-full ${isLarge || isWide ? "aspect-[4/3]" : "aspect-square"}`}
        style={{ background: game.gradient }}
      >
        <div className="absolute inset-0 flex items-center justify-center text-6xl md:text-7xl drop-shadow-lg select-none">
          {game.glyph}
        </div>

        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0 opacity-90" />

        {/* Badges */}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          {game.isNew && (
            <span className="px-2 py-0.5 rounded-md bg-[var(--accent-2)] text-white text-[10px] font-bold uppercase tracking-wider">
              New
            </span>
          )}
          {game.players === "multiplayer" || game.players === "both" ? (
            <span className="px-2 py-0.5 rounded-md bg-black/60 text-white text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm">
              Multiplayer
            </span>
          ) : null}
        </div>

        {/* Play overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
          <div className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center shadow-2xl scale-90 group-hover:scale-100 transition-transform">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 ml-1">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>

      <div className="p-3">
        <h3 className="font-bold text-sm md:text-base truncate group-hover:text-[var(--accent)] transition-colors">
          {game.title}
        </h3>
        <p className="text-xs text-[var(--muted)] truncate">{game.short}</p>
      </div>
    </Link>
  );
}
