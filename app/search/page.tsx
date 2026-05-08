import { searchGames } from "@/lib/catalog";
import { GameGrid } from "@/components/GameGrid";

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
  const results = searchGames(query);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 md:py-10">
      <h1 className="text-2xl md:text-3xl font-black mb-2">
        {query ? `Results for "${query}"` : "Search"}
      </h1>
      <p className="text-[var(--muted)] mb-6">
        {query
          ? `${results.length} ${results.length === 1 ? "game" : "games"} found`
          : "Type a game name, category, or tag in the search bar above."}
      </p>

      {query && <GameGrid games={results} />}
    </div>
  );
}
