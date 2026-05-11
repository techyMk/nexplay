"use client";

/**
 * Top-level error boundary. Without this, an uncaught render error
 * in any server component below the root layout shows Next.js's
 * generic dev-mode error screen in development and a blank page in
 * production. This route renders a friendly fallback with the same
 * shape as the 404 page so the visitor has somewhere to go instead
 * of staring at a blank screen.
 *
 * The `reset` prop comes from Next.js and re-renders the segment in
 * place — useful for transient errors like a flaky Supabase query.
 */

import Link from "next/link";
import { useEffect } from "react";
import { reportError } from "@/lib/telemetry";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error boundary]", error);
    // No-ops unless NEXT_PUBLIC_SENTRY_DSN is set.
    reportError(error, { digest: error.digest, boundary: "app" });
  }, [error]);

  return (
    <div className="mx-auto max-w-xl px-4 sm:px-6 py-12 md:py-20 text-center">
      <div className="text-7xl mb-4 select-none">⚠️</div>
      <h1 className="text-3xl md:text-4xl font-black mb-3 tracking-tight">
        Something went sideways
      </h1>
      <p className="text-[var(--muted)] max-w-md mx-auto mb-6">
        We hit an error rendering this page. The team can&apos;t see what
        broke from here, so if it keeps happening, the{" "}
        <Link href="/feedback" className="text-[var(--accent)] hover:underline">
          feedback form
        </Link>{" "}
        is the fastest way to flag it.
      </p>

      {/* The digest is a short hash Next.js attaches to errors in
          production. Surfacing it lets a reporter quote it so the
          team can correlate logs. Hidden in dev because we already
          have the full stack in the console. */}
      {error.digest && (
        <div className="inline-block px-3 py-1 mb-6 rounded-md bg-[var(--surface-2)] text-[10px] uppercase tracking-widest font-mono text-[var(--muted-2)]">
          ref · {error.digest}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-white font-black text-sm hover:scale-[1.03] transition-transform shadow-md"
        >
          ↻ Try again
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-sm font-bold hover:border-[var(--accent)] transition-colors"
        >
          🏠 Home
        </Link>
      </div>
    </div>
  );
}
