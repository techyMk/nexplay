import Link from "next/link";
import type { ReactNode } from "react";

type Tab = "overview" | "feedback" | "users" | "games";

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: "overview", label: "Overview", emoji: "📊" },
  { id: "feedback", label: "Feedback", emoji: "💬" },
  { id: "users", label: "Top players", emoji: "👤" },
  { id: "games", label: "Games", emoji: "🎮" },
];

export function AdminTabs({
  active,
  overview,
  feedback,
  users,
  games,
}: {
  active: string;
  overview: ReactNode;
  feedback: ReactNode;
  users: ReactNode;
  games: ReactNode;
}) {
  const current = (TABS.find((t) => t.id === active)?.id ?? "overview") as Tab;
  const panel =
    current === "feedback"
      ? feedback
      : current === "users"
        ? users
        : current === "games"
          ? games
          : overview;
  return (
    <>
      <div className="inline-flex rounded-xl bg-[var(--surface)] border border-[var(--border)] p-1 mb-5 overflow-x-auto max-w-full">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/admin?tab=${t.id}`}
            className={`px-3 sm:px-4 py-1.5 rounded-lg text-sm font-bold transition-colors whitespace-nowrap ${
              current === t.id
                ? "bg-[var(--surface-2)] text-[var(--foreground)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            <span className="mr-1.5">{t.emoji}</span>
            {t.label}
          </Link>
        ))}
      </div>
      {panel}
    </>
  );
}
