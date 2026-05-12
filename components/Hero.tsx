"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Game } from "@/lib/types";
import { GameArt } from "./GameArt";

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
    <section className="relative overflow-hidden rounded-2xl mb-8">
      {/* Background gradient — keyed on slug so swapping slides
          retriggers the fade-in. */}
      <div
        key={`bg-${game.slug}`}
        className="absolute inset-0 hero-fade-in"
        style={{ background: game.gradient }}
      />

      <div
        className="absolute inset-0 opacity-40 mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 25% 25%, rgba(255,255,255,0.55), transparent 50%), radial-gradient(circle at 80% 60%, rgba(0,0,0,0.4), transparent 60%)",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/35 to-transparent pointer-events-none" />

      <div className="relative grid lg:grid-cols-[1fr_auto] gap-6 p-6 md:p-12 min-h-[300px] md:min-h-[380px] z-10">
        <div className="flex flex-col justify-end">
          <div
            key={`text-${game.slug}`}
            className="text-white max-w-xl hero-text-in"
          >
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 rounded-md bg-white text-black text-[10px] font-black uppercase tracking-widest">
                  Featured
                </span>
                {game.isNew && (
                  <span className="px-2 py-0.5 rounded-md bg-pink-700 text-white text-[10px] font-black uppercase tracking-widest">
                    New
                  </span>
                )}
              </div>
              <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-2 drop-shadow leading-[1.05]">
                {game.title}
              </h1>
              <p className="text-sm md:text-base text-white/85 mb-4 max-w-md">
                {game.description}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/game/${game.slug}`}
                  className="inline-flex items-center gap-2 h-11 sm:h-10 px-5 rounded-lg bg-white text-black font-bold text-sm hover:scale-105 transition-transform shadow-md"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Play now
                </Link>
                <Link
                  href={`/leaderboard/${game.slug}`}
                  className="inline-flex items-center gap-2 h-11 sm:h-10 px-4 rounded-lg bg-white/15 backdrop-blur-sm border border-white/25 text-white font-bold text-sm hover:bg-white/25 transition-colors"
                >
                  🏆 Leaderboard
                </Link>
              </div>
            </div>
        </div>

        <div className="hidden lg:flex flex-col justify-end items-end">
          <div
            key={`art-${game.slug}`}
            className="drop-shadow-[0_20px_48px_rgba(0,0,0,0.35)] animate-float hero-art-in"
          >
            <GameArt icon={game.icon} glyph={game.glyph} size="hero" />
          </div>
        </div>
      </div>

      {list.length > 1 && (
        <div className="relative z-10 px-6 md:px-10 pb-4 flex gap-2">
          {list.map((g, i) => (
            <button
              key={g.slug}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Show ${g.title}`}
              // Visible pill is 4px tall, but the actual touch target
              // is 24×24 (WCAG minimum) via padding + a flex-centered
              // inner span. Lighthouse used to flag the bare h-1 dots.
              className="inline-flex items-center justify-center h-6 w-6 cursor-pointer"
            >
              <span
                aria-hidden
                className="block h-1 rounded-full transition-all"
                style={{
                  width: i === active ? 28 : 12,
                  background:
                    i === active
                      ? "rgba(255,255,255,1)"
                      : "rgba(255,255,255,0.45)",
                }}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
