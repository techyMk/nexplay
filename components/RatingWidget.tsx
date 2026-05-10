"use client";

import { useState } from "react";
import Link from "next/link";
import { useConfirm } from "./ConfirmDialog";
import { useToast } from "./ToastProvider";

/**
 * Interactive 5-star rating widget with a confirmation flow.
 *
 * - First time: clicking a star previews the choice; a Submit button
 *   commits it. Cancel clears the pending choice.
 * - After submit: the widget is locked and shows your rating. Clicking
 *   any star (or the "Change" link) opens a confirmation dialog before
 *   allowing a new selection — so accidental misclicks don't overwrite
 *   the saved value.
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
  const confirm = useConfirm();
  const toast = useToast();
  const [savedRating, setSavedRating] = useState<number | null>(initialUserRating);
  const [pending, setPending] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
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

  const locked = savedRating !== null && !editing;

  const onStarClick = async (value: number) => {
    if (locked) {
      // Saved already — confirm before allowing a change.
      const ok = await confirm({
        icon: "lucide:edit-3",
        title: "Change your rating?",
        message: `You've already rated this ${savedRating}★. Changing it will overwrite what's saved.`,
        confirmText: "Change rating",
      });
      if (!ok) return;
      setEditing(true);
      setPending(value);
      return;
    }
    setPending(value);
  };

  const submit = async () => {
    if (pending == null) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_slug: gameSlug, rating: pending }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      setSavedRating(pending);
      setPending(null);
      setEditing(false);
      toast({
        variant: "success",
        emoji: "★",
        title: "Rating saved",
        description: `You rated this ${pending} out of 5.`,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    setPending(null);
    setEditing(false);
    setErr(null);
  };

  // What the stars currently render: hover preview > pending > saved
  const display = hover ?? pending ?? savedRating ?? 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="inline-flex items-center gap-0.5"
        onMouseLeave={() => setHover(null)}
      >
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onStarClick(v)}
            onMouseEnter={() => setHover(v)}
            disabled={busy}
            aria-label={`Rate ${v} star${v === 1 ? "" : "s"}`}
            className={`text-2xl transition-transform ${
              v <= display
                ? "text-amber-400"
                : "text-[var(--border-strong)]"
            } ${locked ? "cursor-pointer" : "hover:scale-110"} disabled:opacity-60`}
          >
            ★
          </button>
        ))}
        {locked && savedRating !== null && (
          <span className="ml-2 text-xs text-[var(--muted)]">
            Your rating:{" "}
            <b className="text-[var(--foreground)]">{savedRating}</b> ·{" "}
            <button
              type="button"
              onClick={() => onStarClick(savedRating)}
              className="text-[var(--accent)] hover:underline"
            >
              Change
            </button>
          </span>
        )}
      </div>

      {pending != null && !locked && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--muted)]">
            Submit <b className="text-[var(--foreground)]">{pending}★</b>?
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="px-3 py-1 rounded-lg bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] text-white text-xs font-bold hover:scale-105 transition-transform disabled:opacity-50"
          >
            {busy ? "Saving…" : "Submit"}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={busy}
            className="px-3 py-1 rounded-lg bg-[var(--surface-2)] text-xs font-bold hover:bg-[var(--surface-3)] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      )}

      {err && <span className="text-xs text-red-500">{err}</span>}
    </div>
  );
}
