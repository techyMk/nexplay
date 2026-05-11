import Link from "next/link";
import { popularGames } from "@/lib/catalog";

export const metadata = { title: "Not found — Nexplay" };

/**
 * Catch-all 404 page. Replaces Next.js's bare "404" fallback with
 * something that keeps the visitor in the funnel: a friendly message
 * + four popular games they can hop into instead of bouncing.
 */
export default function NotFound() {
  const picks = popularGames(4);
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-12 md:py-20 text-center">
      <div className="text-7xl mb-4 select-none">🕹️</div>
      <h1 className="text-4xl md:text-5xl font-black mb-3 tracking-tight">
        Lost the level
      </h1>
      <p className="text-[var(--muted)] max-w-md mx-auto mb-8">
        The page you tried to reach doesn&apos;t exist (anymore). Pick a game
        below or head home — your scores are safe.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-white font-black text-sm hover:scale-[1.03] transition-transform shadow-md"
        >
          🏠 Home
        </Link>
        <Link
          href="/search"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-sm font-bold hover:border-[var(--accent)] transition-colors"
        >
          🔎 Search games
        </Link>
      </div>

      {picks.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--muted-2)] font-black mb-3">
            Popular right now
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {picks.map((g) => (
              <Link
                key={g.slug}
                href={`/game/${g.slug}`}
                className="group rounded-xl overflow-hidden border border-[var(--border)] hover:border-[var(--accent)] card-lift"
              >
                <div
                  className="aspect-square flex items-center justify-center text-5xl"
                  style={{ background: g.gradient }}
                >
                  {g.glyph}
                </div>
                <div className="px-3 py-2 bg-[var(--surface)] text-left">
                  <div className="font-black text-sm truncate">{g.title}</div>
                  <div className="text-[11px] text-[var(--muted)] truncate">
                    {g.short}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
