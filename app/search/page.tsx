import Link from "next/link";
import {
  CATEGORIES,
  popularGames,
  searchGames,
  GAMES,
  gamesByCategory,
} from "@/lib/catalog";
import type { Game } from "@/lib/types";
import { GameCard } from "@/components/GameCard";
import { GameGrid } from "@/components/GameGrid";
import { BackButton } from "@/components/BackButton";

export const metadata = {
  title: "Search — Nexplay",
};

type PlayerMode = "all" | "single" | "both" | "multiplayer";

const PLAYER_MODES: { value: PlayerMode; label: string; emoji: string }[] = [
  { value: "all", label: "All", emoji: "🎮" },
  { value: "single", label: "Single", emoji: "👤" },
  { value: "both", label: "2 Player", emoji: "👥" },
  { value: "multiplayer", label: "Online", emoji: "🌐" },
];

/** Apply category + player-mode filters on top of a result list. Both
 *  are URL-param driven so the filter UI is just a row of Link pills. */
function applyFilters(
  list: Game[],
  category: string | null,
  mode: PlayerMode,
): Game[] {
  let out = list;
  if (category) {
    out = out.filter((g) => g.categories.includes(category));
  }
  if (mode !== "all") {
    out = out.filter((g) => g.players === mode);
  }
  return out;
}

/** Build a search URL preserving the other params. Used by the
 *  filter pills so clicking "Puzzle" keeps the `q` and `mode` in
 *  place. Clicking an already-active pill clears that single dim. */
function buildHref(
  q: string,
  cat: string | null,
  mode: PlayerMode,
  patch: { cat?: string | null; mode?: PlayerMode },
): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  const nextCat = patch.cat === undefined ? cat : patch.cat;
  const nextMode = patch.mode === undefined ? mode : patch.mode;
  if (nextCat) params.set("cat", nextCat);
  if (nextMode && nextMode !== "all") params.set("mode", nextMode);
  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string; mode?: string }>;
}) {
  const { q, cat: catParam, mode: modeParam } = await searchParams;
  const query = (q ?? "").trim();
  const category =
    catParam && CATEGORIES.some((c) => c.slug === catParam) ? catParam : null;
  const mode: PlayerMode =
    modeParam === "single" ||
    modeParam === "both" ||
    modeParam === "multiplayer"
      ? modeParam
      : "all";
  const hasFilters = category !== null || mode !== "all";

  // Pre-filter base set: search results if a query exists, else
  // every game if any filter is active, else nothing (landing).
  const base = query ? searchGames(query) : hasFilters ? GAMES : [];
  const results = applyFilters(base, category, mode);
  const noResults = (query.length > 0 || hasFilters) && results.length === 0;
  const showLanding = !query && !hasFilters;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 md:py-10">
      <div className="mb-4">
        <BackButton fallback="/" />
      </div>
      <h1 className="text-2xl md:text-3xl font-black mb-2">
        {query
          ? `Results for "${query}"`
          : hasFilters
            ? "Filtered games"
            : "Search"}
      </h1>
      <p className="text-[var(--muted)] mb-4">
        {query || hasFilters
          ? `${results.length} ${results.length === 1 ? "game" : "games"} found`
          : "Type a game name, category, or tag in the search bar above."}
      </p>

      {/* Filter pills — visible whenever we have a query or any
          active filter. Hidden on the empty landing screen because
          there's nothing to filter yet. */}
      {(query || hasFilters) && (
        <div className="mb-6 space-y-2">
          <FilterRow label="Category">
            <FilterPill
              href={buildHref(query, null, mode, { cat: null })}
              active={category === null}
              emoji="🎯"
            >
              All
            </FilterPill>
            {CATEGORIES.map((c) => {
              const active = category === c.slug;
              // Clicking an active pill clears it; clicking an
              // inactive pill switches to it.
              const next = active ? null : c.slug;
              return (
                <FilterPill
                  key={c.slug}
                  href={buildHref(query, null, mode, { cat: next })}
                  active={active}
                  emoji={c.emoji}
                >
                  {c.title}
                </FilterPill>
              );
            })}
          </FilterRow>
          <FilterRow label="Mode">
            {PLAYER_MODES.map((m) => (
              <FilterPill
                key={m.value}
                href={buildHref(query, category, mode, { mode: m.value })}
                active={mode === m.value}
                emoji={m.emoji}
              >
                {m.label}
              </FilterPill>
            ))}
          </FilterRow>
        </div>
      )}

      {results.length > 0 && <GameGrid games={results} />}

      {noResults && <NoResultsState query={query} hasFilters={hasFilters} />}

      {showLanding && <SearchLanding />}
    </div>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="text-[10px] uppercase tracking-widest text-[var(--muted-2)] font-black w-16 shrink-0">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function FilterPill({
  href,
  active,
  emoji,
  children,
}: {
  href: string;
  active: boolean;
  emoji: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      // `scroll: false` would be nice but Next's Link doesn't expose
      // it as a prop value here without `legacyBehavior`. The page
      // is short enough that the default scroll-top isn't jarring.
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors border ${
        active
          ? "bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-white border-transparent"
          : "bg-[var(--surface)] text-[var(--foreground)] border-[var(--border)] hover:border-[var(--accent)]"
      }`}
    >
      <span>{emoji}</span>
      {children}
    </Link>
  );
}

function NoResultsState({
  query,
  hasFilters,
}: {
  query: string;
  hasFilters: boolean;
}) {
  // Surface the closest popular picks so the page never feels like a dead end.
  const suggestions = popularGames(8);
  return (
    <div>
      <div className="rounded-2xl border border-dashed border-[var(--border)] p-10 text-center mb-8">
        <div className="text-5xl mb-3">🔎</div>
        <h2 className="text-xl font-black mb-1">
          {query
            ? <>No matches for &ldquo;{query}&rdquo;</>
            : "Nothing matches those filters"}
        </h2>
        <p className="text-[var(--muted)] text-sm max-w-md mx-auto">
          {hasFilters
            ? "Try clearing a filter or browsing the picks below."
            : "Try a different keyword, browse a category, or pick something from the popular list below."}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {hasFilters && (
            <Link
              href="/search"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-white text-sm font-bold border border-transparent hover:scale-[1.03] transition-transform"
            >
              ✕ Clear filters
            </Link>
          )}
          {CATEGORIES.slice(0, 6).map((c) => (
            <Link
              key={c.slug}
              href={`/category/${c.slug}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--surface)] border border-[var(--border)] text-sm font-bold hover:border-[var(--accent)] transition-colors"
            >
              <span>{c.emoji}</span>
              {c.title}
            </Link>
          ))}
        </div>
      </div>

      <h3 className="text-lg font-black mb-3">You might like</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {suggestions.map((g, i) => (
          <GameCard key={g.slug} game={g} index={i} />
        ))}
      </div>
    </div>
  );
}

function SearchLanding() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
      {CATEGORIES.map((cat) => {
        const count = gamesByCategory(cat.slug).length;
        return (
          <Link
            key={cat.slug}
            href={`/category/${cat.slug}`}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 hover:border-[var(--accent)] transition-colors"
          >
            <div className="text-xl mb-1">{cat.emoji}</div>
            <div className="font-bold text-sm">{cat.title}</div>
            <div className="text-[10px] text-[var(--muted)] mt-0.5">
              {count} {count === 1 ? "game" : "games"}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
