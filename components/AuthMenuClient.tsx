"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function AuthMenuClient({
  displayName,
  avatar,
}: {
  displayName: string;
  avatar: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--surface)] transition-colors"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex items-center justify-center text-base">
          {avatar}
        </div>
        <span className="hidden sm:inline text-sm font-medium max-w-[120px] truncate">
          {displayName}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl shadow-black/40 overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <div className="text-xs text-[var(--muted)]">Logged in as</div>
            <div className="font-bold truncate">{displayName}</div>
          </div>
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm hover:bg-[var(--surface-2)] transition-colors"
          >
            Profile
          </Link>
          <form action="/logout" method="post">
            <button
              type="submit"
              className="block w-full text-left px-4 py-2.5 text-sm hover:bg-[var(--surface-2)] text-red-400 transition-colors"
            >
              Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
