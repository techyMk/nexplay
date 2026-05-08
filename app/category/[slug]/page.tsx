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
      <div className="mb-6">
        <div className="text-5xl mb-2">{category.emoji}</div>
        <h1 className="text-3xl md:text-4xl font-black">
          {category.title} games
        </h1>
        <p className="text-[var(--muted)] mt-2">{category.description}</p>
      </div>

      <CategoryPills activeSlug={slug} />

      <GameGrid games={games} />
    </div>
  );
}
