"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Interactive 5-star rating widget. POSTs to /api/ratings on click.
 * Hovering previews the value; clicking commits and optimistically
 * updates the displayed rating.
 *
 * Auth-required — non-authed users see a link to /login instead.
 */
export function RatingWidget({
  gameSlug,
  initialUserRating,
  isAuthenticated,
}: {
  gameSlug: string;
  initialUserRating: number | null;
  isAuthenticated: boolean;
}) {
  const [userRating, setUserRating] = useState<number | null>(initialUserRating);
  const [hover, setHover] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!isAuthenticated) {
    return (
      <Link
        href={`/login?next=/game/${gameSlug}`}
        className="inline-flex items-center gap-1.5 text-xs text-[var(--accent)] hover:underline"
      >
        ★ Log in to rate
      </Link>
    );
  }

  const submit = async (value: number) => {
    setBusy(true);
    setErr(null);
    const previous = userRating;
    setUserRating(value); // optimistic

    try {
      const res = await fetch("/api/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_slug: gameSlug, rating: value }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setErr(body?.error ?? `HTTP ${res.status}`);
        setUserRating(previous);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
      setUserRating(previous);
    } finally {
      setBusy(false);
    }
  };

  const display = hover ?? userRating ?? 0;

  return (
    <div className="flex flex-col gap-1">
      <div
        className="inline-flex items-center gap-0.5"
        onMouseLeave={() => setHover(null)}
      >
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => submit(v)}
            onMouseEnter={() => setHover(v)}
            disabled={busy}
            aria-label={`Rate ${v} star${v === 1 ? "" : "s"}`}
            className={`text-2xl transition-transform ${
              v <= display
                ? "text-amber-400"
                : "text-[var(--border-strong)]"
            } hover:scale-110 disabled:opacity-60`}
          >
            ★
          </button>
        ))}
        {userRating !== null && (
          <span className="ml-2 text-xs text-[var(--muted)]">
            Your rating: <b className="text-[var(--foreground)]">{userRating}</b>
          </span>
        )}
      </div>
      {err && <span className="text-xs text-red-500">{err}</span>}
    </div>
  );
}
