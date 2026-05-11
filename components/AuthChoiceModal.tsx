"use client";

/**
 * First-visit auth gate. Shows once to a brand-new (signed-out)
 * visitor with three choices:
 *
 *   - Sign up  → /login (with the next-param so we return here)
 *   - Log in   → /login
 *   - Continue as guest → dismisses, marks them as a guest. They can
 *                still play everything — scores save locally and get
 *                migrated to the global leaderboard if/when they
 *                later create an account (see GuestScoreMigration).
 *
 * Signed-in visitors never see this. The choice is persisted under
 * `nexplay:auth-choice` so we never re-ask. Closing the modal with
 * the X is equivalent to "continue as guest" — we don't want a
 * frustrating "no way out" trap.
 *
 * Mounted in the root layout so the modal can render over any page.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const CHOICE_KEY = "nexplay:auth-choice";
const WAS_GUEST_KEY = "nexplay:was-guest";

/** Routes where popping a modal would be obtrusive — login flows and
 *  in-game pages (where we don't want to interrupt play). */
function isSilentRoute(path: string): boolean {
  return (
    path.startsWith("/login") ||
    path.startsWith("/logout") ||
    path.startsWith("/auth") ||
    path.startsWith("/game/") ||
    path.startsWith("/multiplayer/") &&
      // The lobby pages are fine to show on, but room pages are not.
      /\/multiplayer\/[^/]+\/[^/]+/.test(path)
  );
}

export function AuthChoiceModal({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}) {
  const [show, setShow] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (isAuthenticated) return;
    if (isSilentRoute(pathname)) return;
    try {
      if (!localStorage.getItem(CHOICE_KEY)) setShow(true);
    } catch {
      // private mode — quietly skip
    }
  }, [isAuthenticated, pathname]);

  // Lock body scroll while the modal is open so the page underneath
  // doesn't bounce around when the user interacts.
  useEffect(() => {
    if (!show) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [show]);

  const close = (choice: "signup" | "login" | "guest") => {
    try {
      localStorage.setItem(CHOICE_KEY, choice);
      if (choice === "guest") localStorage.setItem(WAS_GUEST_KEY, "1");
      // Mark the WelcomeCard as dismissed too — this modal IS the
      // welcome experience for first-time visitors, and stacking
      // another "welcome to Nexplay" panel right after they answered
      // the auth prompt would feel repetitive.
      localStorage.setItem("nexplay:welcome-dismissed", "1");
    } catch {
      // private mode — UI dismisses anyway
    }
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-choice-title"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => close("guest")}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-hidden">
        {/* Accent strip */}
        <div className="h-1.5 bg-gradient-to-r from-[var(--accent)] via-[var(--accent-2)] to-[var(--accent-3)]" />

        <button
          type="button"
          onClick={() => close("guest")}
          aria-label="Continue as guest"
          className="absolute top-3 right-3 w-7 h-7 rounded-md hover:bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--foreground)] inline-flex items-center justify-center transition-colors"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="w-4 h-4"
          >
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>

        <div className="px-6 pt-6 pb-5 text-center">
          <div className="text-5xl mb-3 select-none">🎮</div>
          <h2
            id="auth-choice-title"
            className="text-2xl font-black tracking-tight mb-2"
          >
            Welcome to Nexplay
          </h2>
          <p className="text-sm text-[var(--muted)] max-w-xs mx-auto">
            Sign in to save your scores and compete on the global leaderboard,
            or jump in as a guest — we&apos;ll move your scores over if you
            sign up later.
          </p>
        </div>

        <div className="px-6 pb-6 space-y-2">
          <Link
            href="/login?mode=signup&next=/"
            onClick={() => close("signup")}
            className="block px-4 py-3 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-white font-black text-sm text-center hover:scale-[1.02] transition-transform shadow-md"
          >
            ✨ Create a free account
          </Link>
          <Link
            href="/login?next=/"
            onClick={() => close("login")}
            className="block px-4 py-3 rounded-xl bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--foreground)] font-bold text-sm text-center transition-colors"
          >
            Log in
          </Link>
          <button
            type="button"
            onClick={() => close("guest")}
            className="block w-full px-4 py-2.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)] font-medium transition-colors"
          >
            Continue as guest →
          </button>
        </div>
      </div>
    </div>
  );
}
