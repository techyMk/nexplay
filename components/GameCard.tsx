"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { Game } from "@/lib/types";

export type GameCardSize = "default" | "large" | "wide";

export function GameCard({
  game,
  size = "default",
  index = 0,
}: {
  game: Game;
  size?: GameCardSize;
  index?: number;
}) {
  const isLarge = size === "large";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.03, 0.5), ease: [0.2, 0.8, 0.2, 1] }}
    >
      <Link
        href={`/game/${game.slug}`}
        className="group relative block rounded-2xl overflow-hidden card-lift will-change-transform"
      >
        {/* Glow ring on hover */}
        <div
          className="absolute -inset-px rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-xl"
          style={{ background: game.gradient }}
          aria-hidden
        />

        <div className="relative rounded-2xl border border-[var(--border)] group-hover:border-[var(--border-strong)] bg-[var(--surface)] overflow-hidden">
          {/* Thumbnail */}
          <div
            className={`relative w-full ${isLarge ? "aspect-[4/3]" : "aspect-square"}`}
            style={{ background: game.gradient }}
          >
            {/* Decorative noise + vignette */}
            <div className="absolute inset-0 opacity-30 mix-blend-overlay"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.4), transparent 60%)",
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

            {/* Glyph */}
            <div className="absolute inset-0 flex items-center justify-center text-6xl md:text-7xl drop-shadow-[0_8px_16px_rgba(0,0,0,0.35)] select-none transition-transform duration-500 group-hover:scale-110">
              {game.glyph}
            </div>

            {/* Badges */}
            <div className="absolute top-2 left-2 flex flex-wrap gap-1.5">
              {game.isNew && (
                <span className="px-2 py-0.5 rounded-md bg-white/95 text-black text-[10px] font-black uppercase tracking-wider">
                  New
                </span>
              )}
              {(game.players === "multiplayer" || game.players === "both") && (
                <span className="px-2 py-0.5 rounded-md bg-black/70 text-white text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm">
                  👥 Multi
                </span>
              )}
              {game.featured && !game.isNew && (
                <span className="px-2 py-0.5 rounded-md bg-yellow-400 text-black text-[10px] font-black uppercase tracking-wider">
                  ⭐ Hot
                </span>
              )}
            </div>

            {/* Play overlay */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
              <div className="relative w-14 h-14 rounded-full bg-white text-black flex items-center justify-center shadow-2xl scale-90 group-hover:scale-100 transition-transform duration-300">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 ml-1">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-3">
            <h3 className="font-bold text-sm truncate group-hover:text-white transition-colors">
              {game.title}
            </h3>
            <div className="flex items-center justify-between gap-2 mt-0.5">
              <p className="text-xs text-[var(--muted)] truncate">{game.short}</p>
              <span className="text-[10px] text-yellow-400/80 shrink-0">
                ⭐ {game.rating.toFixed(1)}
              </span>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
