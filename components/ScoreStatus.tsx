"use client";

import Link from "next/link";

export function ScoreStatus({
  gameSlug,
  status,
}: {
  gameSlug: string;
  status: "idle" | "submitting" | "submitted" | "error" | "anon";
}) {
  if (status === "idle") return null;

  if (status === "submitting") {
    return (
      <div className="text-xs text-white/60">Saving score…</div>
    );
  }
  if (status === "submitted") {
    return (
      <Link
        href={`/leaderboard/${gameSlug}`}
        className="text-xs text-emerald-400 hover:underline"
      >
        ✓ Score saved — view leaderboard
      </Link>
    );
  }
  if (status === "anon") {
    return (
      <Link
        href={`/login?next=/game/${gameSlug}`}
        className="text-xs text-[var(--accent)] hover:underline"
      >
        Log in to save your score and rank up →
      </Link>
    );
  }
  return <div className="text-xs text-red-400">Couldn&apos;t save score</div>;
}
