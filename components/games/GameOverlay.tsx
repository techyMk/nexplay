"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Reusable full-cover overlay used by single-player games for the
 * "ready" (Start), "paused" (Continue), and "over" screens. It sits
 * inside each game's canvas wrapper as the last child and absolutely
 * fills it. The wrapper must be `relative`.
 */
export function GameOverlay({
  variant = "default",
  icon,
  title,
  subtitle,
  primary,
  secondary,
  showHome = true,
  homeHref = "/",
  children,
}: {
  variant?: "default" | "blur";
  icon?: string;
  title?: string;
  subtitle?: ReactNode;
  /** Big primary button (e.g. Play, Resume, Try again). */
  primary?: { label: string; onClick: () => void };
  /** Optional secondary button rendered next to primary. */
  secondary?: { label: string; onClick: () => void };
  /** Show a small "Home" link below the buttons. Defaults to true so
   *  every game-end / pause / start screen has an escape hatch. */
  showHome?: boolean;
  homeHref?: string;
  /** Anything else to render above the buttons (e.g. score chip). */
  children?: ReactNode;
}) {
  return (
    <div
      // Stop pointer/click events from bubbling to the game wrapper.
      // Several games attach pointerdown/click listeners on the wrap
      // div that call start() when over=true — without stopping
      // propagation here, tapping "Home" would re-launch the game
      // (unmounting the overlay) before the <Link> click could
      // navigate, so the user would land back inside the game.
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      className={`absolute inset-0 z-10 flex flex-col items-center justify-center rounded-xl gap-2 p-4 ${
        variant === "blur" ? "bg-black/65 backdrop-blur-sm" : "bg-black/70"
      }`}
    >
      {icon && (
        <div className="text-5xl mb-1" aria-hidden>
          {icon}
        </div>
      )}
      {title && (
        <div className="text-3xl sm:text-4xl font-black text-white text-center">
          {title}
        </div>
      )}
      {subtitle && (
        <div className="text-white/80 text-sm text-center max-w-xs">
          {subtitle}
        </div>
      )}
      {children}
      {(primary || secondary) && (
        <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
          {primary && (
            <button
              onClick={primary.onClick}
              // h-12 sm:h-auto + py-3 keeps a consistent 48px target
              // on mobile (Apple HIG / Material both want >= 44px).
              className="inline-flex items-center justify-center h-12 sm:h-auto px-6 py-3 rounded-lg bg-white text-black font-bold text-base hover:scale-105 active:scale-95 transition-transform shadow-lg"
            >
              {primary.label}
            </button>
          )}
          {secondary && (
            <button
              onClick={secondary.onClick}
              className="inline-flex items-center justify-center h-12 sm:h-auto px-5 py-2.5 rounded-lg bg-white/10 text-white font-bold text-base hover:bg-white/20 active:bg-white/30 transition-colors"
            >
              {secondary.label}
            </button>
          )}
        </div>
      )}
      {showHome && (
        <Link
          href={homeHref}
          // text-sm on mobile so the link is tappable; the 8px gap
          // and bigger hit area come from the inline-flex padding.
          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm sm:text-xs text-white/70 hover:text-white transition-colors"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-3.5 h-3.5"
            aria-hidden
          >
            <path d="M3 9.5L12 3l9 6.5V21H3z" />
            <path d="M9 21V12h6v9" />
          </svg>
          Home
        </Link>
      )}
    </div>
  );
}

/** Inline pill toggle for the HUD row. */
export function PauseToggle({
  paused,
  onClick,
  disabled,
}: {
  paused: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors disabled:opacity-40"
    >
      {paused ? "▶ Resume" : "⏸ Pause"}
    </button>
  );
}
