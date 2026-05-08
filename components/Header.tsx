import Link from "next/link";
import { SearchBar } from "./SearchBar";
import { AuthMenu } from "./AuthMenu";

export function Header() {
  return (
    <header className="sticky top-0 z-40 glass border-b border-[var(--border)]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2.5 group shrink-0">
          <div className="relative">
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] blur-md opacity-60 group-hover:opacity-100 transition-opacity" />
            <div className="relative w-9 h-9 rounded-xl flex items-center justify-center text-lg font-black text-white bg-gradient-to-br from-[var(--accent)] via-[var(--accent-2)] to-[var(--accent-3)] group-hover:scale-105 transition-transform">
              N
            </div>
          </div>
          <span className="text-xl font-black tracking-tight">
            Nex<span className="text-gradient">play</span>
          </span>
        </Link>

        <div className="flex-1 max-w-xl mx-auto">
          <SearchBar />
        </div>

        <nav className="hidden md:flex items-center gap-1 text-sm font-medium text-[var(--muted)]">
          <Link
            href="/multiplayer"
            className="px-3 py-2 rounded-lg hover:text-white hover:bg-[var(--surface)] transition-colors flex items-center gap-1.5"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            Multiplayer
          </Link>
          <Link
            href="/category/2-player"
            className="px-3 py-2 rounded-lg hover:text-white hover:bg-[var(--surface)] transition-colors"
          >
            2 Player
          </Link>
          <Link
            href="/category/puzzle"
            className="px-3 py-2 rounded-lg hover:text-white hover:bg-[var(--surface)] transition-colors"
          >
            Puzzle
          </Link>
        </nav>

        <AuthMenu />
      </div>
    </header>
  );
}
