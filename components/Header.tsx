import Link from "next/link";
import { SearchBar } from "./SearchBar";
import { AuthMenu } from "./AuthMenu";

export function Header() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-[var(--background)]/70 border-b border-[var(--border)]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2 group shrink-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg font-black text-white shadow-lg shadow-[var(--accent-glow)] bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] group-hover:scale-105 transition-transform">
            N
          </div>
          <span className="text-xl font-black tracking-tight">
            Nex<span className="text-[var(--accent)]">play</span>
          </span>
        </Link>

        <div className="flex-1 max-w-xl mx-auto">
          <SearchBar />
        </div>

        <nav className="hidden md:flex items-center gap-1 text-sm font-medium text-[var(--muted)]">
          <Link
            href="/"
            className="px-3 py-2 rounded-lg hover:text-white hover:bg-[var(--surface)] transition-colors"
          >
            Home
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
