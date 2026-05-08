"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function SearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    setValue(searchParams.get("q") ?? "");
  }, [searchParams]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
      }}
      className="relative w-full"
      role="search"
    >
      <input
        type="search"
        placeholder="Search games…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
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
  );
}
