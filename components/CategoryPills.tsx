import Link from "next/link";
import { CATEGORIES } from "@/lib/catalog";

export function CategoryPills({ activeSlug }: { activeSlug?: string }) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 -mx-4 px-4 mb-8">
      {CATEGORIES.map((cat) => {
        const active = cat.slug === activeSlug;
        return (
          <Link
            key={cat.slug}
            href={`/category/${cat.slug}`}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
              active
                ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                : "bg-[var(--surface)] border-[var(--border)] text-[var(--muted)] hover:text-white hover:border-[var(--accent)]"
            }`}
          >
            <span className="mr-1.5">{cat.emoji}</span>
            {cat.title}
          </Link>
        );
      })}
    </div>
  );
}
