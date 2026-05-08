import Link from "next/link";
import { CATEGORIES } from "@/lib/catalog";

export function CategoryPills({ activeSlug }: { activeSlug?: string }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-2 -mx-4 px-4 mb-6">
      <Link
        href="/"
        className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-bold transition-colors whitespace-nowrap ${
          !activeSlug
            ? "bg-[var(--foreground)] text-white"
            : "bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--foreground)]"
        }`}
      >
        All
      </Link>
      {CATEGORIES.map((cat) => {
        const active = cat.slug === activeSlug;
        return (
          <Link
            key={cat.slug}
            href={`/category/${cat.slug}`}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-bold transition-colors whitespace-nowrap ${
              active
                ? "bg-[var(--foreground)] text-white"
                : "bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            <span className="mr-1">{cat.emoji}</span>
            {cat.title}
          </Link>
        );
      })}
    </div>
  );
}
