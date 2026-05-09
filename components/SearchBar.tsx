"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { searchGames } from "@/lib/catalog";
import type { Game } from "@/lib/types";
import { GameArt } from "./GameArt";

const MAX_SUGGESTIONS = 6;

export function SearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") ?? "");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync from URL when navigating
  useEffect(() => {
    setValue(searchParams.get("q") ?? "");
  }, [searchParams]);

  const matches: Game[] = useMemo(() => {
    const q = value.trim();
    if (!q) return [];
    return searchGames(q).slice(0, MAX_SUGGESTIONS);
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    if (activeIdx >= 0 && matches[activeIdx]) {
      router.push(`/game/${matches[activeIdx].slug}`);
    } else {
      router.push(`/search?q=${encodeURIComponent(q)}`);
    }
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || matches.length === 0) {
      if (e.key === "ArrowDown" && matches.length > 0) {
        setOpen(true);
        setActiveIdx(0);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i <= 0 ? matches.length - 1 : i - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIdx(-1);
    }
  };

  const showDropdown = open && matches.length > 0;

  return (
    <div className="relative w-full" ref={containerRef}>
      <form onSubmit={submit} role="search" className="relative">
        <input
          ref={inputRef}
          type="search"
          placeholder="Search games…"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
            setActiveIdx(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          className="w-full h-9 pl-9 pr-3 rounded-lg bg-[var(--surface-2)] border border-transparent focus:border-[var(--accent)] focus:bg-white focus:outline-none text-sm placeholder:text-[var(--muted)] transition-all"
        />
        <svg
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" strokeLinecap="round" />
        </svg>
      </form>

      {showDropdown && (
        <div
          className="absolute top-full left-0 right-0 mt-1.5 rounded-xl bg-white shadow-2xl border border-[var(--border)] overflow-hidden z-50"
          role="listbox"
        >
          {matches.map((g, i) => (
            <Link
              key={g.slug}
              href={`/game/${g.slug}`}
              role="option"
              aria-selected={i === activeIdx}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 px-3 py-2 transition-colors ${
                i === activeIdx
                  ? "bg-[var(--surface-2)]"
                  : "hover:bg-[var(--surface-2)]"
              }`}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
                style={{ background: g.gradient }}
              >
                <GameArt icon={g.icon} glyph={g.glyph} size="sm" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate">{g.title}</div>
                <div className="text-xs text-[var(--muted)] truncate">
                  {g.short}
                </div>
              </div>
              <span className="text-[10px] text-amber-600 font-bold shrink-0">
                ★ {g.rating.toFixed(1)}
              </span>
            </Link>
          ))}
          <Link
            href={`/search?q=${encodeURIComponent(value.trim())}`}
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-xs text-center font-bold text-[var(--accent)] hover:bg-[var(--accent)]/10 border-t border-[var(--border)]"
          >
            See all results for &ldquo;{value.trim()}&rdquo; →
          </Link>
        </div>
      )}
    </div>
  );
}
