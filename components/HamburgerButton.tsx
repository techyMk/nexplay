"use client";

/**
 * Mobile-only hamburger that toggles the sidebar via a global event.
 * Sidebar listens for "nexplay:toggle-sidebar" on the window and
 * flips its open state.
 */
export function HamburgerButton() {
  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(new Event("nexplay:toggle-sidebar"))
      }
      className="lg:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[var(--surface-2)] transition-colors shrink-0"
      aria-label="Open menu"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        className="w-5 h-5 text-[var(--foreground)]"
      >
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  );
}
