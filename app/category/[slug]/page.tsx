import { notFound } from "next/navigation";
import { CATEGORIES, gamesByCategory, getCategory } from "@/lib/catalog";
import { CategoryPills } from "@/components/CategoryPills";
import { GameGrid } from "@/components/GameGrid";
import { BackButton } from "@/components/BackButton";

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
    <div className="px-4 sm:px-6 lg:px-8 py-5 md:py-7 max-w-[1500px] mx-auto">
      <div className="mb-3">
        <BackButton fallback="/" />
      </div>
      <div className="mb-5">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-3xl">{category.emoji}</span>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">
            {category.title}
          </h1>
          <span className="ml-auto text-sm text-[var(--muted)] font-medium">
            {games.length} {games.length === 1 ? "game" : "games"}
          </span>
        </div>
        <p className="text-sm text-[var(--muted)]">{category.description}</p>
      </div>

      <CategoryPills activeSlug={slug} />

      <GameGrid games={games} />
    </div>
  );
}
