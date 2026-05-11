"use client";

import Link from "next/link";
import type { Game } from "@/lib/types";
import { GameArt } from "./GameArt";
import { TilePattern } from "./TilePattern";

export type GameCardSize = "default" | "large" | "wide" | "tall";

const SIZE_CLASS: Record<GameCardSize, string> = {
  default: "",
  // `large` and `wide` go full-width on mobile so the always-on title
  // overlay has room. Without col-span-2 on mobile they'd render as
  // half-width cards with cramped overlay text, looking inconsistent
  // next to default cards (which show the title below the tile).
  large: "col-span-2 row-span-2 sm:col-span-2 sm:row-span-2",
  wide: "col-span-2 sm:col-span-2",
  tall: "sm:row-span-2",
};

const ASPECT: Record<GameCardSize, string> = {
  default: "aspect-square",
  large: "aspect-square",
  wide: "aspect-[2/1]",
  tall: "aspect-[1/2]",
};

const ART_SIZE: Record<GameCardSize, "lg" | "xl" | "hero"> = {
  default: "lg",
  large: "hero",
  wide: "xl",
  tall: "xl",
};

export function GameCard({
  game,
  size = "default",
  index = 0,
}: {
  game: Game;
  size?: GameCardSize;
  index?: number;
}) {
  const isBig = size !== "default";
  // Staggered fade-in. Capped at 250ms so cards lower in the grid
  // still feel responsive — long-running stagger animations were
  // hurting LCP on slow devices.
  const animDelay = `${Math.min(index * 18, 250)}ms`;

  return (
    <div
      className={`group card-fade-in ${SIZE_CLASS[size]}`}
      style={{ animationDelay: animDelay }}
    >
      <Link
        href={`/game/${game.slug}`}
        className={`relative block ${ASPECT[size]} rounded-2xl overflow-hidden card-lift shadow-sm group-hover:shadow-xl ring-1 ring-black/5`}
        style={{ background: game.gradient }}
      >
        {/* Per-game pattern texture */}
        <TilePattern slug={game.slug} />

        {/* Soft inner highlights */}
        <div
          className="absolute inset-0 opacity-50 mix-blend-overlay"
          style={{
            backgroundImage:
              "radial-gradient(circle at 28% 22%, rgba(255,255,255,0.55), transparent 60%)",
          }}
        />

        {/* Art */}
        <div
          className={`absolute inset-0 flex items-center justify-center transition-transform duration-300 ${
            isBig ? "group-hover:scale-105" : "group-hover:scale-110"
          }`}
        >
          <GameArt icon={game.icon} glyph={game.glyph} size={ART_SIZE[size]} />
        </div>

        {/* Top-left badges */}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1.5 z-10">
          {game.isNew && (
            <span className="px-2 py-0.5 rounded-md bg-white text-black text-[10px] font-black uppercase tracking-wider shadow">
              New
            </span>
          )}
          {(game.players === "multiplayer" || game.players === "both") && (
            <span className="px-2 py-0.5 rounded-md bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider shadow">
              Multi
            </span>
          )}
          {game.featured && !game.isNew && (
            <span className="px-2 py-0.5 rounded-md bg-amber-400 text-black text-[10px] font-black uppercase tracking-wider shadow">
              Hot
            </span>
          )}
        </div>

        {/* Top-right rating chip on big tiles */}
        {isBig && (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/55 backdrop-blur-sm text-white text-xs font-bold flex items-center gap-1 z-10">
            ★ {game.rating.toFixed(1)}
          </div>
        )}

        {/* Big-tile title bar (always visible on big tiles) */}
        {isBig && (
          <>
            <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-4 md:p-5 z-10">
              <h3 className="text-2xl md:text-3xl font-black text-white drop-shadow leading-tight">
                {game.title}
              </h3>
              <p className="text-sm text-white/85 mt-0.5 line-clamp-1">
                {game.short}
              </p>
            </div>
          </>
        )}

        {/* Default-tile: title appears in a sliding overlay on hover */}
        {!isBig && (
          <>
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/75 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="absolute inset-x-0 bottom-0 p-2.5 z-10 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
              <h3 className="text-sm font-black text-white drop-shadow leading-tight truncate">
                {game.title}
              </h3>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <span className="text-[10px] text-white/80 truncate">
                  {game.short}
                </span>
                <span className="text-[10px] text-amber-300 shrink-0 font-bold">
                  ★ {game.rating.toFixed(1)}
                </span>
              </div>
            </div>
          </>
        )}

        {/* Hover play button */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-12 h-12 rounded-full bg-white text-black shadow-xl flex items-center justify-center scale-50 opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-all duration-200">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 ml-0.5">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </Link>

      {/* Title strip below for default size — Poki style, always visible */}
      {!isBig && (
        <div className="pt-2 px-0.5">
          <h3 className="text-sm font-bold truncate text-[var(--foreground)] group-hover:text-[var(--accent-2)] transition-colors">
            {game.title}
          </h3>
        </div>
      )}
    </div>
  );
}
