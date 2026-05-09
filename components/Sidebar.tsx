"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CATEGORIES } from "@/lib/catalog";
import { useEffect, useRef, useState } from "react";
import { useConfirm } from "./ConfirmDialog";

type NavItem = {
  href: string;
  emoji: string;
  label: string;
  hot?: boolean;
};

const TOP_NAV: NavItem[] = [
  { href: "/", emoji: "🏠", label: "Home" },
  { href: "/multiplayer", emoji: "👥", label: "Multiplayer", hot: true },
  { href: "/guide", emoji: "📖", label: "How to play" },
];

export function Sidebar({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  };

  const isCategoryActive = (slug: string) => pathname === `/category/${slug}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 left-4 z-50 lg:hidden w-12 h-12 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-white shadow-lg flex items-center justify-center"
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

      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed lg:sticky top-16 left-0 z-40 lg:z-0 h-[calc(100vh-4rem)] w-56 shrink-0 transition-transform lg:transition-none ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="h-full overflow-y-auto p-2 border-r border-[var(--border)] bg-[var(--surface)] lg:bg-transparent">
          <nav className="space-y-0.5">
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

          <div className="mt-4 px-3 mb-1.5">
            <div className="text-[10px] uppercase tracking-widest text-[var(--muted-2)] font-bold">
              Categories
            </div>
          </div>

          <nav className="space-y-0.5">
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

          <div className="mt-4 px-3 mb-1.5">
            <div className="text-[10px] uppercase tracking-widest text-[var(--muted-2)] font-bold">
              Account
            </div>
          </div>

          <nav className="space-y-0.5">
            {isAuthenticated ? (
              <>
                <NavRow href="/friends" emoji="👥" label="Friends" active={isActive("/friends")} />
                <NavRow href="/profile" emoji="👤" label="Profile" active={isActive("/profile")} />
                <LogoutRow />
              </>
            ) : (
              <NavRow href="/login" emoji="🔑" label="Log in" active={isActive("/login")} />
            )}
          </nav>
        </div>
      </aside>
    </>
  );
}

function LogoutRow() {
  const confirm = useConfirm();
  const formRef = useRef<HTMLFormElement>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await confirm({
      icon: "lucide:log-out",
      title: "Log out?",
      message: "You can sign back in any time to keep saving scores.",
      confirmText: "Log out",
      danger: true,
    });
    if (ok) formRef.current?.submit();
  };

  return (
    <form ref={formRef} action="/logout" method="post" onSubmit={onSubmit}>
      <button
        type="submit"
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-[var(--muted)] hover:text-red-500 hover:bg-red-50 transition-colors"
      >
        <span className="text-lg leading-none">🚪</span>
        <span className="flex-1 text-left">Log out</span>
      </button>
    </form>
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
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? "bg-[var(--surface-2)] text-[var(--foreground)] font-bold"
          : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)]"
      }`}
    >
      <span className="text-lg leading-none">{emoji}</span>
      <span className="flex-1">{label}</span>
      {hot && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
      )}
    </Link>
  );
}
