"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { Game } from "@/lib/types";

export type GameCardSize = "default" | "large" | "wide" | "tall";

const SIZE_CLASS: Record<GameCardSize, string> = {
  default: "",
  large: "sm:col-span-2 sm:row-span-2",
  wide: "sm:col-span-2",
  tall: "sm:row-span-2",
};

export function GameCard({
  game,
  size = "default",
  index = 0,
  showTitle = true,
}: {
  game: Game;
  size?: GameCardSize;
  index?: number;
  showTitle?: boolean;
}) {
  const isBig = size === "large" || size === "wide" || size === "tall";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.35,
        delay: Math.min(index * 0.025, 0.4),
        ease: [0.2, 0.8, 0.2, 1],
      }}
      className={`group ${SIZE_CLASS[size]}`}
    >
      <Link href={`/game/${game.slug}`} className="block">
        {/* Tile */}
        <div className="relative rounded-2xl overflow-hidden card-lift">
          {/* Outer glow */}
          <div
            className="absolute -inset-1 rounded-3xl opacity-0 group-hover:opacity-70 transition-opacity duration-500 blur-xl pointer-events-none"
            style={{ background: game.gradient }}
            aria-hidden
          />

          <div
            className={`relative ${isBig ? "aspect-[4/3]" : "aspect-square"} overflow-hidden ring-1 ring-white/10 group-hover:ring-2 group-hover:ring-white/30 transition-all`}
            style={{ background: game.gradient }}
          >
            {/* Ambient highlights — give each tile depth */}
            <div
              className="absolute inset-0 mix-blend-overlay opacity-50"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 25% 20%, rgba(255,255,255,0.55), transparent 55%), radial-gradient(circle at 80% 80%, rgba(0,0,0,0.4), transparent 55%)",
              }}
            />

            {/* Pattern noise */}
            <div
              className="absolute inset-0 opacity-[0.06] mix-blend-soft-light"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.5'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
              }}
            />

            {/* Glyph */}
            <div
              className={`absolute inset-0 flex items-center justify-center select-none drop-shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition-all duration-500 group-hover:scale-110 ${
                isBig ? "text-8xl md:text-9xl" : "text-6xl md:text-7xl"
              }`}
              style={{ filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.3))" }}
            >
              {game.glyph}
            </div>

            {/* Bottom gradient veil */}
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-100 group-hover:opacity-0 transition-opacity duration-300" />

            {/* Hover backdrop */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-300" />

            {/* Badges (top-left) */}
            <div className="absolute top-2 left-2 flex flex-wrap gap-1.5">
              {game.isNew && (
                <span className="px-2 py-0.5 rounded-md bg-white text-black text-[10px] font-black uppercase tracking-wider shadow-lg">
                  New
                </span>
              )}
              {(game.players === "multiplayer" || game.players === "both") && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider shadow-lg">
                  Multi
                </span>
              )}
              {game.featured && !game.isNew && (
                <span className="px-2 py-0.5 rounded-md bg-yellow-400 text-black text-[10px] font-black uppercase tracking-wider shadow-lg">
                  Hot
                </span>
              )}
            </div>

            {/* Rating chip (top-right, only on big tiles) */}
            {isBig && (
              <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-white text-xs font-bold flex items-center gap-1">
                ⭐ {game.rating.toFixed(1)}
              </div>
            )}

            {/* Big-tile bottom panel: shows title inside the tile when big */}
            {isBig && (
              <div className="absolute inset-x-0 bottom-0 p-4 md:p-5 z-10">
                <h3 className="text-2xl md:text-3xl font-black text-white drop-shadow-lg">
                  {game.title}
                </h3>
                <p className="text-sm text-white/80 mt-1 line-clamp-1">
                  {game.short}
                </p>
              </div>
            )}

            {/* Hover play button */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-14 h-14 rounded-full bg-white text-black shadow-2xl flex items-center justify-center scale-50 opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-all duration-300">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 ml-0.5">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Title strip below — Poki style (only for default tiles) */}
          {!isBig && showTitle && (
            <div className="pt-2.5 pb-1 px-0.5">
              <h3 className="text-sm font-bold truncate group-hover:text-[var(--accent-2)] transition-colors">
                {game.title}
              </h3>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <p className="text-[11px] text-[var(--muted)] truncate">
                  {game.short}
                </p>
                <span className="text-[10px] text-yellow-400/80 shrink-0 font-medium">
                  ⭐ {game.rating.toFixed(1)}
                </span>
              </div>
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
