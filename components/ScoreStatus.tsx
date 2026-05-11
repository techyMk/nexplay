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
    // Made deliberately CTA-shaped (button, accent gradient) so guests
    // notice the value-prop of signing in instead of glossing over a
    // plain text link.
    return (
      <Link
        href={`/login?next=/game/${gameSlug}`}
        className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-white text-xs font-black hover:scale-[1.03] transition-transform shadow-md"
      >
        🏆 Sign in to save this score →
      </Link>
    );
  }
  return <div className="text-xs text-red-400">Couldn&apos;t save score</div>;
}
