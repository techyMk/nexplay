"use client";

/**
 * TouchPad — on-screen control overlay for the action games.
 *
 * Why it works without per-game refactors: pressing a button
 * dispatches a synthetic `keydown` (or `keyup` on release) event on
 * `window` with the configured `KeyboardEvent.key`. Every game that
 * already listens for keyboard input — `useKeyboard()` users, or
 * plain `window.addEventListener("keydown", ...)` setups — picks the
 * synthetic event up the same way it would a real keystroke. No
 * changes needed inside the game's input handler.
 *
 * The overlay only renders on coarse-pointer / no-hover devices
 * (phones, tablets), so it stays out of the way on desktop. Buttons
 * sit in the bottom-left and bottom-right corners of the parent —
 * the wrapper is `pointer-events-none` so taps anywhere ELSE on the
 * canvas still reach the game.
 */

import { useCallback } from "react";

export type TouchPadButton = {
  /** `KeyboardEvent.key` value to fire — e.g. "ArrowLeft", " ", "w". */
  key: string;
  /** Visible label inside the button (single glyph or short word). */
  label: string;
  /** Optional colour tone. Defaults to neutral grey-tinted glass. */
  tone?: "default" | "accent" | "danger" | "success";
};

export function TouchPad({
  left = [],
  right = [],
  visible = true,
}: {
  left?: TouchPadButton[];
  right?: TouchPadButton[];
  /**
   * When false, hides the pad. Use this to keep the pad out of the
   * way during intro/pause/game-over overlays so the play button is
   * the only thing the user sees.
   */
  visible?: boolean;
}) {
  const press = useCallback((key: string) => {
    // bubbles: true lets the synthetic event flow up to window
    // listeners the same way a real keystroke would.
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  }, []);
  const release = useCallback((key: string) => {
    window.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
  }, []);

  if (left.length === 0 && right.length === 0) return null;
  if (!visible) return null;

  return (
    // Tailwind arbitrary media query — only show on devices where
    // hover is unavailable (touch-only). `flex` is the active state;
    // `hidden` is the desktop default.
    // z-5 sits above the canvas but below GameOverlay (z-10) so the
    // pause / over screens cover the buttons cleanly.
    <div
      className="pointer-events-none absolute inset-0 z-[5] hidden [@media(hover:none)]:block"
      // env(safe-area-inset-bottom) keeps buttons clear of the iOS
      // home bar; clamped to 12px on devices that don't expose it.
      style={{
        paddingBottom: "max(12px, env(safe-area-inset-bottom, 12px))",
      }}
    >
      {left.length > 0 && (
        <div className="absolute bottom-3 left-3 flex gap-2.5 pointer-events-auto">
          {left.map((b, i) => (
            <PadBtn key={i} btn={b} onPress={press} onRelease={release} />
          ))}
        </div>
      )}
      {right.length > 0 && (
        <div className="absolute bottom-3 right-3 flex gap-2.5 pointer-events-auto">
          {right.map((b, i) => (
            <PadBtn key={i} btn={b} onPress={press} onRelease={release} />
          ))}
        </div>
      )}
    </div>
  );
}

function PadBtn({
  btn,
  onPress,
  onRelease,
}: {
  btn: TouchPadButton;
  onPress: (key: string) => void;
  onRelease: (key: string) => void;
}) {
  const tone = btn.tone ?? "default";
  // Higher base opacity so the buttons are visible against bright
  // game backgrounds — earlier 30-45% values washed out on Slither
  // and Drift King where the canvas paints near-white particles.
  const palette =
    tone === "accent"
      ? "bg-[var(--accent)]/55 active:bg-[var(--accent)]/80 border-[var(--accent)]/70"
      : tone === "danger"
        ? "bg-rose-500/50 active:bg-rose-500/80 border-rose-400/70"
        : tone === "success"
          ? "bg-emerald-500/50 active:bg-emerald-500/80 border-emerald-400/70"
          : "bg-black/55 active:bg-black/80 border-white/40";

  return (
    <button
      type="button"
      // Pointer events cover both touch and mouse-on-touchscreens.
      // We also listen to leave / cancel so a finger sliding off the
      // button doesn't leave the key stuck in the "held" state.
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        onPress(btn.key);
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        onRelease(btn.key);
      }}
      onPointerCancel={() => onRelease(btn.key)}
      onPointerLeave={(e) => {
        // Only release if the button was actively captured; otherwise
        // hovering past a non-pressed button shouldn't fire keyup.
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          onRelease(btn.key);
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
      className={`w-16 h-16 sm:w-16 sm:h-16 rounded-2xl ${palette} border-2 backdrop-blur-sm text-white text-2xl font-black flex items-center justify-center select-none touch-none shadow-xl shadow-black/40 transition-colors`}
      aria-label={btn.label}
    >
      {btn.label}
    </button>
  );
}
