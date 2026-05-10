"use client";

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
  /** Anything else to render above the buttons (e.g. score chip). */
  children?: ReactNode;
}) {
  return (
    <div
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
              className="px-6 py-3 rounded-lg bg-white text-black font-bold hover:scale-105 transition-transform"
            >
              {primary.label}
            </button>
          )}
          {secondary && (
            <button
              onClick={secondary.onClick}
              className="px-5 py-2.5 rounded-lg bg-white/10 text-white font-bold hover:bg-white/20 transition-colors"
            >
              {secondary.label}
            </button>
          )}
        </div>
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
