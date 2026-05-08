"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { Game } from "@/lib/types";
import { GameArt } from "./GameArt";

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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.25,
        delay: Math.min(index * 0.02, 0.3),
      }}
      className={`group ${SIZE_CLASS[size]}`}
    >
      <Link href={`/game/${game.slug}`} className="block">
        <div className="relative">
          <div
            className={`relative ${isBig ? "aspect-[4/3]" : "aspect-square"} rounded-2xl overflow-hidden card-lift shadow-sm group-hover:shadow-lg`}
            style={{ background: game.gradient }}
          >
            {/* Soft inner highlights */}
            <div
              className="absolute inset-0 opacity-50 mix-blend-overlay"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 28% 25%, rgba(255,255,255,0.5), transparent 60%)",
              }}
            />

            {/* Art */}
            <div
              className={`absolute inset-0 flex items-center justify-center transition-transform duration-300 group-hover:scale-110`}
            >
              <GameArt
                icon={game.icon}
                glyph={game.glyph}
                size={isBig ? "xl" : "lg"}
              />
            </div>

            {/* Top-left badges */}
            <div className="absolute top-2 left-2 flex flex-wrap gap-1.5">
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
                <span className="px-2 py-0.5 rounded-md bg-yellow-400 text-black text-[10px] font-black uppercase tracking-wider shadow">
                  Hot
                </span>
              )}
            </div>

            {/* Big-tile rating chip */}
            {isBig && (
              <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/55 backdrop-blur-sm text-white text-xs font-bold flex items-center gap-1">
                ⭐ {game.rating.toFixed(1)}
              </div>
            )}

            {/* Big-tile title bar */}
            {isBig && (
              <>
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4 md:p-5 z-10">
                  <h3 className="text-2xl md:text-3xl font-black text-white drop-shadow">
                    {game.title}
                  </h3>
                  <p className="text-sm text-white/85 mt-0.5 line-clamp-1">
                    {game.short}
                  </p>
                </div>
              </>
            )}

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors duration-200" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-12 h-12 rounded-full bg-white text-black shadow-lg flex items-center justify-center scale-50 opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-all duration-200">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 ml-0.5">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Title below for default size */}
          {!isBig && showTitle && (
            <div className="pt-2 px-0.5">
              <h3 className="text-sm font-bold truncate text-[var(--foreground)] group-hover:text-[var(--accent-2)] transition-colors">
                {game.title}
              </h3>
              <div className="flex items-center justify-between gap-1 mt-0.5">
                <p className="text-[11px] text-[var(--muted)] truncate">{game.short}</p>
                <span className="text-[10px] text-amber-600 shrink-0 font-bold">
                  ★ {game.rating.toFixed(1)}
                </span>
              </div>
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
