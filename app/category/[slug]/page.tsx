import { notFound } from "next/navigation";
import { CATEGORIES, gamesByCategory, getCategory } from "@/lib/catalog";
import { CategoryPills } from "@/components/CategoryPills";
import { GameGrid } from "@/components/GameGrid";

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cat = getCategory(slug);
  if (!cat) return {};
  return {
    title: `${cat.title} games — Nexplay`,
    description: cat.description,
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = getCategory(slug);
  if (!category) notFound();

  const games = gamesByCategory(slug);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 md:py-10">
      <div className="rounded-3xl border border-[var(--border)] bg-gradient-to-br from-[var(--surface)] to-[var(--surface-2)] p-8 mb-8 relative overflow-hidden">
        <div className="absolute -right-8 -top-8 text-[260px] opacity-10 select-none">
          {category.emoji}
        </div>
        <div className="relative">
          <div className="text-5xl mb-3">{category.emoji}</div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-2">
            {category.title} <span className="text-gradient">games</span>
          </h1>
          <p className="text-[var(--muted)] max-w-xl">
            {category.description}
          </p>
          <div className="mt-3 text-xs text-[var(--muted)]">
            {games.length} {games.length === 1 ? "game" : "games"} available
          </div>
        </div>
      </div>

      <CategoryPills activeSlug={slug} />

      <GameGrid games={games} />
    </div>
  );
}
