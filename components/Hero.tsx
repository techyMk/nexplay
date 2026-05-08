"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import type { Game } from "@/lib/types";

export function Hero({ games }: { games: Game[] }) {
  const [active, setActive] = useState(0);
  const list = games.slice(0, Math.max(1, Math.min(games.length, 5)));

  useEffect(() => {
    if (list.length < 2) return;
    const id = setInterval(() => setActive((a) => (a + 1) % list.length), 6500);
    return () => clearInterval(id);
  }, [list.length]);

  const game = list[active];
  if (!game) return null;

  return (
    <section className="relative overflow-hidden rounded-[28px] mb-10">
      <AnimatePresence mode="wait">
        <motion.div
          key={game.slug}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
          className="absolute inset-0"
          style={{ background: game.gradient }}
        />
      </AnimatePresence>

      {/* Mesh + vignette overlay */}
      <div
        className="absolute inset-0 opacity-50 mix-blend-overlay"
        style={{
          backgroundImage:
            "radial-gradient(circle at 25% 25%, rgba(255,255,255,0.5), transparent 50%), radial-gradient(circle at 80% 60%, rgba(0,0,0,0.4), transparent 60%)",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />

      {/* Content */}
      <div className="relative grid md:grid-cols-2 gap-8 p-8 md:p-14 min-h-[340px] md:min-h-[440px] items-center z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={`text-${game.slug}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
            className="text-white"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2.5 py-1 rounded-md bg-white text-black text-[10px] font-black uppercase tracking-widest">
                Featured
              </span>
              {game.isNew && (
                <span className="px-2.5 py-1 rounded-md bg-[var(--accent-2)] text-white text-[10px] font-black uppercase tracking-widest">
                  New
                </span>
              )}
              <span className="text-[10px] text-white/70 uppercase tracking-widest">
                {game.categories.slice(0, 2).join(" • ")}
              </span>
            </div>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tight mb-4 drop-shadow-2xl">
              {game.title}
            </h1>
            <p className="text-base md:text-lg text-white/85 mb-6 max-w-md leading-relaxed">
              {game.description}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/game/${game.slug}`}
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-white text-black font-bold text-sm hover:scale-105 transition-transform shadow-2xl"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Play now
              </Link>
              <Link
                href={`/leaderboard/${game.slug}`}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 text-white font-bold text-sm hover:bg-white/20 transition-colors"
              >
                🏆 Leaderboard
              </Link>
              <span className="text-xs text-white/60 hidden sm:inline">
                ⭐ {game.rating.toFixed(1)} · {game.plays.toLocaleString()} plays
              </span>
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="hidden md:flex items-center justify-center relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={`glyph-${game.slug}`}
              initial={{ opacity: 0, scale: 0.6, rotate: -10 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.8, rotate: 10 }}
              transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
              className="text-[180px] lg:text-[220px] drop-shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
            >
              {game.glyph}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Slide indicators */}
      {list.length > 1 && (
        <div className="absolute bottom-5 left-8 md:left-14 z-10 flex gap-2">
          {list.map((g, i) => (
            <button
              key={g.slug}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Show ${g.title}`}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: i === active ? 32 : 12,
                background:
                  i === active ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.4)",
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
