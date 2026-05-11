"use client";

/**
 * Quick light/dark toggle for the header. Cycles light → dark → system
 * on click. The actual application happens via lib/theme — this
 * component just owns the icon + label state.
 *
 * On first render we show the system fallback (a "computer" glyph)
 * for an instant before the hydration effect reads the real choice
 * from localStorage. That brief flash is fine and avoids both an
 * SSR hydration mismatch and a flash of the wrong theme (the inline
 * ThemeScript handles the actual document.documentElement bit).
 */

import { useEffect, useState } from "react";
import {
  applyTheme,
  getStoredTheme,
  setTheme as persistTheme,
  type Theme,
} from "@/lib/theme";

export function ThemeToggle() {
  const [theme, setLocal] = useState<Theme>("system");

  useEffect(() => {
    setLocal(getStoredTheme());
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<Theme>).detail;
      if (detail) setLocal(detail);
    };
    window.addEventListener("nexplay:theme-changed", onChange);
    return () =>
      window.removeEventListener("nexplay:theme-changed", onChange);
  }, []);

  // System-preference media listener — if the user is on "system",
  // flip the document attribute when the OS theme changes.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const cycle = () => {
    const next: Theme =
      theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setLocal(next);
    persistTheme(next);
  };

  const icon =
    theme === "light" ? (
      // Sun
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-4 h-4"
        aria-hidden
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    ) : theme === "dark" ? (
      // Moon
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-4 h-4"
        aria-hidden
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    ) : (
      // Monitor (system)
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-4 h-4"
        aria-hidden
      >
        <rect x="2" y="4" width="20" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    );

  const label =
    theme === "light"
      ? "Switch to dark mode"
      : theme === "dark"
        ? "Switch to system theme"
        : "Switch to light mode";

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={label}
      title={label}
      className="w-9 h-9 rounded-lg hover:bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--foreground)] inline-flex items-center justify-center transition-colors"
    >
      {icon}
    </button>
  );
}
