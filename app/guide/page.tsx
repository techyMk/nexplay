import Link from "next/link";
import { GAMES, getCategory } from "@/lib/catalog";
import { GUIDES, type Guide } from "@/lib/guides";
import { GameArt } from "@/components/GameArt";
import { BackButton } from "@/components/BackButton";

export const metadata = {
  title: "How to play — Nexplay",
  description:
    "Quick how-to-play guides, controls, and tips for every game on Nexplay.",
};

export default function GuidePage() {
  const sorted = [...GAMES].sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-6 md:py-10">
      <div className="mb-4">
        <BackButton fallback="/" />
      </div>

      <div className="mb-8">
        <div className="text-4xl mb-2">📖</div>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-2">
          How to play
        </h1>
        <p className="text-[var(--muted)] max-w-xl">
          Quick controls, objectives, and tips for every game in the catalog.
          Click a game to expand its guide.
        </p>
      </div>

      {/* Quick TOC */}
      <div className="mb-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="text-[10px] uppercase tracking-widest text-[var(--muted-2)] font-bold mb-2">
          Jump to
        </div>
        <div className="flex flex-wrap gap-1.5">
          {sorted.map((g) => (
            <a
              key={g.slug}
              href={`#guide-${g.slug}`}
              className="px-2.5 py-1 rounded-md bg-[var(--surface-2)] hover:bg-[var(--accent)] hover:text-white text-xs font-bold transition-colors"
            >
              {g.title}
            </a>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {sorted.map((game) => {
          const guide = GUIDES[game.slug];
          if (!guide) return null;
          return (
            <GuideCard
              key={game.slug}
              slug={game.slug}
              title={game.title}
              short={game.short}
              gradient={game.gradient}
              icon={game.icon}
              glyph={game.glyph}
              category={
                game.categories[0]
                  ? getCategory(game.categories[0])?.title
                  : undefined
              }
              guide={guide}
            />
          );
        })}
      </div>

      <div className="mt-10 text-center text-sm text-[var(--muted)]">
        Looking for something we don&apos;t cover? Tell us — head to{" "}
        <a
          href="https://github.com/techyMk/nexplay/issues"
          target="_blank"
          rel="noreferrer"
          className="text-[var(--accent-text)] hover:underline"
        >
          GitHub
        </a>
        .
      </div>
    </div>
  );
}

function GuideCard({
  slug,
  title,
  short,
  gradient,
  icon,
  glyph,
  category,
  guide,
}: {
  slug: string;
  title: string;
  short: string;
  gradient: string;
  icon?: string;
  glyph: string;
  category?: string;
  guide: Guide;
}) {
  return (
    <details
      id={`guide-${slug}`}
      className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] open:shadow-md scroll-mt-20"
    >
      <summary className="cursor-pointer list-none px-4 py-3 flex items-center gap-4 hover:bg-[var(--surface-2)] rounded-2xl group-open:rounded-b-none transition-colors">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
          style={{ background: gradient }}
        >
          <GameArt icon={icon} glyph={glyph} size="sm" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-black truncate">{title}</div>
          <div className="text-xs text-[var(--muted)] truncate">{short}</div>
        </div>
        {category && (
          <span className="hidden sm:inline px-2 py-0.5 rounded-md bg-[var(--surface-2)] text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
            {category}
          </span>
        )}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4 text-[var(--muted)] transition-transform group-open:rotate-180"
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>

      <div className="px-4 pb-5 pt-1 border-t border-[var(--border)]">
        <div className="space-y-4 mt-3">
          <Block label="Objective">{guide.objective}</Block>

          <Block label="Controls">
            <ul className="space-y-1">
              {guide.controls.map((c, i) => (
                <li
                  key={i}
                  className="text-sm flex items-start gap-2 leading-relaxed"
                >
                  <span className="text-[var(--accent-text)] shrink-0">•</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </Block>

          <Block label="How to play">
            <ol className="space-y-2">
              {guide.steps.map((s, i) => (
                <li key={i} className="text-sm flex gap-3 leading-relaxed">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-[var(--accent)]/15 text-[var(--accent-text)] text-[10px] font-black flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </Block>

          {guide.tips && guide.tips.length > 0 && (
            <Block label="Tips">
              <ul className="space-y-1.5">
                {guide.tips.map((t, i) => (
                  <li
                    key={i}
                    className="text-sm flex items-start gap-2 leading-relaxed text-[var(--foreground-2)]"
                  >
                    <span className="text-amber-500 shrink-0">★</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </Block>
          )}

          <div className="pt-2">
            <Link
              href={`/game/${slug}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] text-white text-sm font-bold hover:scale-105 transition-transform"
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-3.5 h-3.5"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
              Play {title}
            </Link>
          </div>
        </div>
      </div>
    </details>
  );
}

function Block({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-[var(--muted-2)] font-bold mb-1.5">
        {label}
      </div>
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  );
}
