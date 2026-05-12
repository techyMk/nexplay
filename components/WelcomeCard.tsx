"use client";

/**
 * First-time-visitor welcome strip.
 *
 * Renders at the top of the home page on the first visit. Stays
 * dismissed forever via localStorage so returning visitors aren't
 * pestered.
 *
 * CLS note: we render the card visible on the server (`show: true`)
 * so first-time visitors don't see a layout shift when JS hydrates
 * and the card pops in. Returning visitors briefly see the card,
 * then JS reads localStorage and collapses it. Trading a tiny shift
 * on repeat visits for a perfect first-impression Lighthouse score.
 */

import Link from "next/link";
import { useEffect, useState } from "react";

const STORAGE_KEY = "nexplay:welcome-dismissed";

/** `gameCount` is passed in from the server page so this client
 *  component doesn't have to import the full catalog (and ship it
 *  in the client bundle) just to read its length. */
export function WelcomeCard({ gameCount }: { gameCount: number }) {
  const [show, setShow] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY)) {
        setShow(false);
      }
    } catch {
      // private mode — leave it shown rather than crash
    }
  }, []);

  if (!show) return null;

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // private mode
    }
  };

  return (
    <div className="relative mb-6 overflow-hidden rounded-2xl border border-[var(--accent)]/25 bg-gradient-to-br from-[var(--accent)]/15 via-[var(--accent-2)]/12 to-[var(--accent-3)]/15">
      {/* Decorative blobs for some visual life. */}
      <div
        className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-25 blur-2xl pointer-events-none"
        style={{ background: "var(--accent-2)" }}
      />
      <div
        className="absolute -bottom-12 -left-8 w-32 h-32 rounded-full opacity-20 blur-2xl pointer-events-none"
        style={{ background: "var(--accent-3)" }}
      />

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss welcome card"
        className="absolute top-2 right-2 w-7 h-7 rounded-md text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)] inline-flex items-center justify-center transition-colors z-10"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className="w-3.5 h-3.5"
        >
          <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
        </svg>
      </button>

      <div className="relative grid sm:grid-cols-[1fr_auto] gap-4 p-5 sm:p-6 items-center">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-black text-[var(--accent-text)] mb-1.5">
            <span>✨</span> Welcome to Nexplay
          </div>
          <h2 className="text-xl sm:text-2xl font-black mb-2 leading-tight">
            Pick a game, play instantly.
          </h2>
          <p className="text-sm text-[var(--muted)] max-w-xl leading-relaxed">
            30+ free browser games — no downloads, no signups required. Tap a
            tile below to start. Sign in any time to save your scores and
            compete on the global leaderboards.
          </p>

          {/* Three quick pitches in a single row so first-time visitors can
              see what the site is in one glance without reading paragraphs. */}
          <div className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
            <Bullet emoji="🎮" title={`${gameCount} games`} desc="No downloads" />
            <Bullet emoji="🏆" title="Leaderboards" desc="Sign in to rank" />
            <Bullet emoji="🎯" title="Daily" desc="Fresh challenges" />
          </div>
        </div>

        <div className="flex sm:flex-col gap-2 shrink-0">
          <Link
            href="#trending"
            onClick={dismiss}
            scroll
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-white text-sm font-black hover:scale-[1.03] transition-transform shadow-md whitespace-nowrap"
          >
            ▶ Start playing
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--foreground)] text-sm font-bold transition-colors whitespace-nowrap"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

function Bullet({
  emoji,
  title,
  desc,
}: {
  emoji: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-lg bg-[var(--surface)]/55 backdrop-blur-sm border border-[var(--border)] px-2 py-1.5 flex items-center gap-2">
      <span className="text-base shrink-0">{emoji}</span>
      <div className="min-w-0">
        <div className="font-black truncate">{title}</div>
        <div className="text-[var(--muted)] truncate text-[10px]">{desc}</div>
      </div>
    </div>
  );
}
