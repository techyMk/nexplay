import Link from "next/link";
import { GAMES } from "@/lib/catalog";
import { GameArt } from "./GameArt";
import { TilePattern } from "./TilePattern";

/**
 * Picks one game per day deterministically (day-of-year hash) and
 * showcases it in a wide colored banner. Same all day for a given
 * visitor, refreshes at UTC midnight, so it feels curated.
 */
function pickToday() {
  const day = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  // Prefer custom games — they're our actual originals
  const pool = GAMES.filter((g) => g.source === "custom");
  return pool[day % pool.length] ?? GAMES[0];
}

export function GameOfTheDay() {
  const game = pickToday();

  return (
    <section className="mb-10">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-lg md:text-xl font-black flex items-center gap-2">
          <span className="text-xl">🎯</span>
          Game of the day
        </h2>
        <span className="text-xs text-[var(--muted)] font-medium">
          Refreshes daily
        </span>
      </div>

      <Link
        href={`/game/${game.slug}`}
        className="relative block rounded-3xl overflow-hidden card-lift shadow-md hover:shadow-2xl ring-1 ring-black/5"
      >
        <div className="absolute inset-0" style={{ background: game.gradient }} />
        <TilePattern slug={game.slug} />
        <div
          className="absolute inset-0 opacity-40 mix-blend-overlay"
          style={{
            backgroundImage:
              "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.55), transparent 55%), radial-gradient(circle at 80% 70%, rgba(0,0,0,0.45), transparent 60%)",
          }}
        />

        {/* Sparkle accents */}
        <div className="absolute top-6 right-12 text-2xl select-none rotate-12 opacity-90">
          ✨
        </div>
        <div className="absolute bottom-10 left-1/3 text-xl select-none -rotate-6 opacity-80">
          ⭐
        </div>

        <div className="relative grid sm:grid-cols-[auto_1fr_auto] gap-6 items-center p-6 md:p-8 min-h-[200px] text-white">
          {/* Art */}
          <div className="flex justify-center sm:justify-start">
            <div className="drop-shadow-[0_12px_32px_rgba(0,0,0,0.35)]">
              <GameArt icon={game.icon} glyph={game.glyph} size="hero" />
            </div>
          </div>

          {/* Text */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="px-2 py-0.5 rounded-md bg-white text-black text-[10px] font-black uppercase tracking-widest">
                Featured today
              </span>
              {game.isNew && (
                <span className="px-2 py-0.5 rounded-md bg-[var(--accent-2)] text-white text-[10px] font-black uppercase tracking-widest">
                  New
                </span>
              )}
              <span className="text-[10px] text-white/80 uppercase tracking-widest font-bold">
                {game.categories.slice(0, 2).join(" · ")}
              </span>
            </div>
            <h3 className="text-3xl md:text-4xl font-black tracking-tight mb-2 drop-shadow leading-tight">
              {game.title}
            </h3>
            <p className="text-white/85 text-sm md:text-base max-w-xl line-clamp-2">
              {game.description}
            </p>
          </div>

          {/* CTA */}
          <div className="flex sm:flex-col items-stretch gap-2 shrink-0">
            <span className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white text-stone-900 font-bold text-sm shadow-md whitespace-nowrap">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M8 5v14l11-7z" />
              </svg>
              Play now
            </span>
          </div>
        </div>
      </Link>
    </section>
  );
}
