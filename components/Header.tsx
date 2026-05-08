import Link from "next/link";
import { Suspense } from "react";
import { SearchBar } from "./SearchBar";
import { AuthMenu } from "./AuthMenu";

export function Header() {
  return (
    <header className="sticky top-0 z-40 glass border-b border-[var(--border)]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2 group shrink-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black text-white bg-gradient-to-br from-[var(--accent)] via-[var(--accent-2)] to-[var(--accent-3)]">
            N
          </div>
          <span className="text-lg font-black tracking-tight">
            Nex<span className="text-gradient">play</span>
          </span>
        </Link>

        <div className="flex-1 max-w-lg mx-auto">
          <Suspense fallback={<div className="h-9 rounded-lg bg-[var(--surface-2)]" />}>
            <SearchBar />
          </Suspense>
        </div>

        <nav className="hidden md:flex items-center gap-1 text-sm font-medium text-[var(--muted)]">
          <Link
            href="/multiplayer"
            className="px-3 py-1.5 rounded-lg hover:text-[var(--foreground)] hover:bg-[var(--surface-2)] transition-colors flex items-center gap-1.5"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            Multiplayer
          </Link>
          <Link
            href="/category/2-player"
            className="px-3 py-1.5 rounded-lg hover:text-[var(--foreground)] hover:bg-[var(--surface-2)] transition-colors"
          >
            2 Player
          </Link>
          <Link
            href="/category/puzzle"
            className="px-3 py-1.5 rounded-lg hover:text-[var(--foreground)] hover:bg-[var(--surface-2)] transition-colors"
          >
            Puzzle
          </Link>
        </nav>

        <AuthMenu />
      </div>
    </header>
  );
}
