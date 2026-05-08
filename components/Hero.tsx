import Link from "next/link";
import type { Game } from "@/lib/types";

export function Hero({ game }: { game: Game }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-[var(--border)] mb-10 group">
      <div
        className="absolute inset-0 opacity-90"
        style={{ background: game.gradient }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />

      <div className="relative grid md:grid-cols-2 gap-8 p-8 md:p-12 min-h-[280px] md:min-h-[360px] items-center">
        <div className="text-white">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2 py-0.5 rounded-md bg-[var(--accent-2)] text-[10px] font-bold uppercase tracking-wider">
              Featured
            </span>
            {game.isNew && (
              <span className="px-2 py-0.5 rounded-md bg-white/20 backdrop-blur-sm text-[10px] font-bold uppercase tracking-wider">
                New
              </span>
            )}
          </div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-3">
            {game.title}
          </h1>
          <p className="text-base md:text-lg text-white/80 mb-6 max-w-md">
            {game.description}
          </p>
          <Link
            href={`/game/${game.slug}`}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-black font-bold text-sm hover:scale-105 transition-transform shadow-lg"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M8 5v14l11-7z" />
            </svg>
            Play now
          </Link>
        </div>

        <div className="hidden md:flex items-center justify-center text-[160px] drop-shadow-2xl">
          {game.glyph}
        </div>
      </div>
    </section>
  );
}
