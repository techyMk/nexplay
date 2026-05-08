"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { Game } from "@/lib/types";

export function Hero({ games }: { games: Game[] }) {
  const list = games.slice(0, Math.max(1, Math.min(games.length, 5)));
  const [active, setActive] = useState(0);

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
          key={`bg-${game.slug}`}
          initial={{ opacity: 0, scale: 1.06 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
          className="absolute inset-0"
          style={{ background: game.gradient }}
        />
      </AnimatePresence>

      <div
        className="absolute inset-0 opacity-50 mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 25% 25%, rgba(255,255,255,0.55), transparent 50%), radial-gradient(circle at 80% 60%, rgba(0,0,0,0.45), transparent 60%)",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />

      <div className="relative grid lg:grid-cols-[1fr_auto] gap-8 p-6 md:p-12 min-h-[360px] md:min-h-[460px] z-10">
        <div className="flex flex-col justify-end">
          <AnimatePresence mode="wait">
            <motion.div
              key={`text-${game.slug}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
              className="text-white max-w-xl"
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
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tight mb-4 drop-shadow-2xl leading-[1.05]">
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
        </div>

        <div className="hidden lg:flex flex-col justify-end items-end gap-3">
          <div className="text-[200px] xl:text-[260px] drop-shadow-[0_20px_60px_rgba(0,0,0,0.5)] leading-none">
            <AnimatePresence mode="wait">
              <motion.span
                key={`glyph-${game.slug}`}
                initial={{ opacity: 0, scale: 0.7, rotate: -8 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.85, rotate: 8 }}
                transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
                className="inline-block"
              >
                {game.glyph}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Thumbnails strip */}
      {list.length > 1 && (
        <div className="relative z-10 px-6 md:px-12 pb-5">
          <div className="flex gap-2 md:gap-3">
            {list.map((g, i) => (
              <button
                key={g.slug}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Show ${g.title}`}
                className={`group relative shrink-0 rounded-xl overflow-hidden transition-all ${
                  i === active ? "w-20 h-12 ring-2 ring-white" : "w-12 h-12 ring-1 ring-white/30 hover:ring-white/70"
                }`}
                style={{ background: g.gradient }}
              >
                <div className="absolute inset-0 flex items-center justify-center text-xl">
                  {g.glyph}
                </div>
                {i === active && (
                  <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
