import Link from "next/link";
import { CATEGORIES, popularGames, searchGames } from "@/lib/catalog";
import { GameCard } from "@/components/GameCard";
import { GameGrid } from "@/components/GameGrid";
import { BackButton } from "@/components/BackButton";

export const metadata = {
  title: "Search — Nexplay",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const results = query ? searchGames(query) : [];
  const noResults = query.length > 0 && results.length === 0;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 md:py-10">
      <div className="mb-4">
        <BackButton fallback="/" />
      </div>
      <h1 className="text-2xl md:text-3xl font-black mb-2">
        {query ? `Results for "${query}"` : "Search"}
      </h1>
      <p className="text-[var(--muted)] mb-6">
        {query
          ? `${results.length} ${results.length === 1 ? "game" : "games"} found`
          : "Type a game name, category, or tag in the search bar above."}
      </p>

      {results.length > 0 && <GameGrid games={results} />}

      {noResults && <NoResultsState query={query} />}

      {!query && <SearchLanding />}
    </div>
  );
}

function NoResultsState({ query }: { query: string }) {
  // Surface the closest popular picks so the page never feels like a dead end.
  const suggestions = popularGames(8);
  return (
    <div>
      <div className="rounded-2xl border border-dashed border-[var(--border)] p-10 text-center mb-8">
        <div className="text-5xl mb-3">🔎</div>
        <h2 className="text-xl font-black mb-1">No matches for &ldquo;{query}&rdquo;</h2>
        <p className="text-[var(--muted)] text-sm max-w-md mx-auto">
          Try a different keyword, browse a category, or pick something from the
          popular list below.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
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
      {CATEGORIES.map((cat) => (
        <Link
          key={cat.slug}
          href={`/category/${cat.slug}`}
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 hover:border-[var(--accent)] transition-colors"
        >
          <div className="text-xl mb-1">{cat.emoji}</div>
          <div className="font-bold text-sm">{cat.title}</div>
        </Link>
      ))}
    </div>
  );
}
