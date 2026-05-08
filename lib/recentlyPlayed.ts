"use client";

import { useEffect, useState } from "react";

const KEY = "nexplay:recently-played";
const MAX = 12;

export function recordPlay(slug: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    const next = [slug, ...list.filter((s) => s !== slug)].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("nexplay:recently-played-updated"));
  } catch {
    // ignore quota / privacy mode errors
  }
}

export function useRecentlyPlayed(): string[] {
  const [slugs, setSlugs] = useState<string[]>([]);

  useEffect(() => {
    const read = () => {
      try {
        const raw = window.localStorage.getItem(KEY);
        setSlugs(raw ? JSON.parse(raw) : []);
      } catch {
        setSlugs([]);
      }
    };
    read();
    window.addEventListener("nexplay:recently-played-updated", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("nexplay:recently-played-updated", read);
      window.removeEventListener("storage", read);
    };
  }, []);

  return slugs;
}
