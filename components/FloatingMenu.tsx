"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

type Item = {
  href: string;
  label: string;
  external: boolean;
  /** Inline SVG so we don't pay an icon-font / network round-trip. */
  icon: React.ReactNode;
  /** Tailwind classes for the gradient pill background. */
  bg: string;
};

const ITEMS: Item[] = [
  {
    href: "/feedback",
    label: "Send feedback",
    external: false,
    bg: "from-emerald-500 to-cyan-500",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    ),
  },
  {
    href: "https://www.buymeacoffee.com/techymk",
    label: "Buy me a coffee",
    external: true,
    bg: "from-amber-400 to-orange-500",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M17 8h1a4 4 0 0 1 0 8h-1" />
        <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z" />
        <path d="M6 1v3M10 1v3M14 1v3" />
      </svg>
    ),
  },
  {
    href: "https://github.com/techyMk/nexplay",
    label: "GitHub",
    external: true,
    bg: "from-zinc-700 to-zinc-900",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18A11 11 0 0 1 12 6.85c.99 0 1.99.13 2.92.39 2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.18c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
      </svg>
    ),
  },
  {
    href: "https://techymk.vercel.app/",
    label: "Portfolio",
    external: true,
    bg: "from-violet-500 to-fuchsia-500",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
  },
];

/**
 * Bottom-right speed-dial. Click the small circle to expand a stack of
 * pill-shaped links. Hidden on multiplayer room URLs so it can't
 * obscure live-game UI; everywhere else it's a quick way to reach the
 * feedback form, GitHub, the developer's portfolio, and a tip jar.
 */
export function FloatingMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Collapse when route changes
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Hide inside multiplayer rooms — they have their own toolbars and
  // we don't want the FAB to overlap room status.
  if (/^\/multiplayer\/[^/]+\/[A-Z0-9]+/i.test(pathname)) return null;

  return (
    <div
      className="fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-40 print:hidden"
      role="region"
      aria-label="Quick links"
    >
      <AnimatePresence>
        {open && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 bg-black/30 backdrop-blur-[1px] -z-10"
            aria-hidden
          />
        )}
        {open && (
          <motion.ul
            key="items"
            className="absolute bottom-14 right-0 flex flex-col items-end gap-2.5 mb-1"
            initial="closed"
            animate="open"
            exit="closed"
            variants={{
              open: { transition: { staggerChildren: 0.04 } },
              closed: { transition: { staggerChildren: 0.02, staggerDirection: -1 } },
            }}
          >
            {ITEMS.map((item) => (
              <motion.li
                key={item.label}
                variants={{
                  open: {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    transition: { type: "spring", stiffness: 380, damping: 28 },
                  },
                  closed: { opacity: 0, y: 12, scale: 0.85 },
                }}
              >
                {item.external ? (
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setOpen(false)}
                    className={`group flex items-center gap-2 pl-3 pr-3.5 h-10 rounded-full bg-gradient-to-r ${item.bg} text-white text-xs sm:text-sm font-bold shadow-lg shadow-black/30 hover:shadow-xl hover:scale-[1.04] transition-transform`}
                  >
                    <span className="opacity-95">{item.icon}</span>
                    <span>{item.label}</span>
                  </a>
                ) : (
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`group flex items-center gap-2 pl-3 pr-3.5 h-10 rounded-full bg-gradient-to-r ${item.bg} text-white text-xs sm:text-sm font-bold shadow-lg shadow-black/30 hover:shadow-xl hover:scale-[1.04] transition-transform`}
                  >
                    <span className="opacity-95">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                )}
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close quick links" : "Open quick links"}
        aria-expanded={open}
        className="relative w-12 h-12 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-white shadow-xl shadow-[var(--accent-glow)] flex items-center justify-center"
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.95 }}
      >
        <motion.span
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 24 }}
          className="block"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            className="w-5 h-5"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </motion.span>
      </motion.button>
    </div>
  );
}
