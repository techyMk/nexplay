import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { SearchBar } from "./SearchBar";
import { AuthMenu } from "./AuthMenu";
import { NotificationBell } from "./NotificationBell";
import { HamburgerButton } from "./HamburgerButton";
import { ThemeToggle } from "./ThemeToggle";

export function Header() {
  return (
    <header className="sticky top-0 z-40 glass border-b border-[var(--border)]">
      <div className="mx-auto max-w-7xl px-2 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center gap-1.5 sm:gap-4">
        <HamburgerButton />

        <Link
          href="/"
          className="flex items-center group shrink-0"
          aria-label="Nexplay home"
        >
          <Image
            src="/nexplay-logo.png"
            alt="Nexplay"
            width={400}
            height={200}
            priority
            // Displayed at 32-48px tall. With explicit sizes, next/image
            // picks the right srcset variant rather than serving the
            // full-size asset to every viewport.
            sizes="(min-width: 640px) 96px, 80px"
            className="h-8 sm:h-12 w-auto group-hover:scale-105 transition-transform"
          />
        </Link>

        {/* Search gets the bulk of the row on mobile. */}
        <div className="flex-1 min-w-0 max-w-lg mx-auto">
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

        {/* On very narrow screens we hide the theme toggle from the
            header — it's accessible from /settings and the sidebar
            has a copy. NotificationBell stays because it shows
            unread counts that the user needs at a glance. */}
        <div className="hidden sm:block">
          <ThemeToggle />
        </div>
        <NotificationBell />
        <AuthMenu />
      </div>
    </header>
  );
}
