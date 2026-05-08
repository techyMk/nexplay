"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CATEGORIES } from "@/lib/catalog";
import { useEffect, useState } from "react";

type NavItem = {
  href: string;
  emoji: string;
  label: string;
  hot?: boolean;
};

const TOP_NAV: NavItem[] = [
  { href: "/", emoji: "🏠", label: "Home" },
  { href: "/multiplayer", emoji: "👥", label: "Multiplayer", hot: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false); // close drawer on route change
  }, [pathname]);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  };

  const isCategoryActive = (slug: string) => pathname === `/category/${slug}`;

  return (
    <>
      {/* Mobile toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 left-4 z-50 lg:hidden w-12 h-12 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-white shadow-2xl shadow-[var(--accent-glow)] flex items-center justify-center"
        aria-label="Toggle menu"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5">
          {open ? (
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
          ) : (
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          )}
        </svg>
      </button>

      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed lg:sticky top-16 left-0 z-40 lg:z-0 h-[calc(100vh-4rem)] w-64 shrink-0 transition-transform lg:transition-none ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="h-full overflow-y-auto p-3 border-r border-[var(--border)] glass lg:bg-transparent lg:backdrop-blur-none lg:border-r-0">
          <nav className="space-y-1">
            {TOP_NAV.map((item) => (
              <NavRow
                key={item.href}
                href={item.href}
                emoji={item.emoji}
                label={item.label}
                active={isActive(item.href)}
                hot={item.hot}
              />
            ))}
          </nav>

          <div className="my-4 px-3">
            <div className="text-[10px] uppercase tracking-widest text-[var(--muted)] font-bold">
              Categories
            </div>
          </div>

          <nav className="space-y-1">
            {CATEGORIES.map((cat) => (
              <NavRow
                key={cat.slug}
                href={`/category/${cat.slug}`}
                emoji={cat.emoji}
                label={cat.title}
                active={isCategoryActive(cat.slug)}
              />
            ))}
          </nav>

          <div className="my-4 px-3">
            <div className="text-[10px] uppercase tracking-widest text-[var(--muted)] font-bold">
              Account
            </div>
          </div>

          <nav className="space-y-1">
            <NavRow href="/profile" emoji="👤" label="Profile" active={isActive("/profile")} />
            <NavRow href="/login" emoji="🔑" label="Log in" active={isActive("/login")} />
          </nav>

          <div className="mt-6 mx-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]/60 text-xs">
            <div className="text-[10px] uppercase tracking-widest text-[var(--muted)] font-bold mb-1.5">
              Tip
            </div>
            <p className="text-[var(--muted)] leading-relaxed">
              Sign up to climb the leaderboards and play multiplayer with friends.
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}

function NavRow({
  href,
  emoji,
  label,
  active,
  hot,
}: {
  href: string;
  emoji: string;
  label: string;
  active: boolean;
  hot?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
        active
          ? "bg-gradient-to-r from-[var(--accent)]/20 to-transparent text-white border border-[var(--accent)]/40"
          : "text-[var(--muted)] hover:text-white hover:bg-[var(--surface)]"
      }`}
    >
      <span
        className={`text-xl transition-transform ${active ? "scale-110" : "group-hover:scale-110"}`}
      >
        {emoji}
      </span>
      <span className="flex-1">{label}</span>
      {hot && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
      )}
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-full bg-gradient-to-b from-[var(--accent)] to-[var(--accent-2)]" />
      )}
    </Link>
  );
}
