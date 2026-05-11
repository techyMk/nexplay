"use client";

/**
 * Migrates a guest user's local best scores into Supabase after they
 * sign up / sign in. Mounted in the root layout — does nothing for
 * signed-out visitors, and exits cheaply for signed-in visitors who
 * have already been migrated.
 *
 * Strategy
 * --------
 *  1. Mount detects `isAuthenticated && !hasMigratedFlag`.
 *  2. Scan localStorage for `nexplay:<slug>-best[-<extra>]` keys.
 *  3. For each one, parse a positive number out of the value (some
 *     games store a bare number, others a JSON `{ score, ... }`).
 *  4. POST through `submitScore` (existing /api/scores endpoint).
 *  5. Mark the migrated flag on success. Failures leave the flag
 *     unset so the next mount retries — the server picks the max
 *     between an existing leaderboard entry and the resubmission, so
 *     re-submission is safe.
 *
 * Slug aliasing
 * -------------
 * A handful of older games store their best-score keys under a
 * shortened name that doesn't match the catalog slug (eg
 * `nexplay:hanoi-best-5` for tower-of-hanoi). SLUG_ALIASES maps
 * those back so the API gets the correct game_slug.
 */

import { useEffect } from "react";
import { submitScore } from "@/lib/scores";
import { useToast } from "@/components/ToastProvider";
import { clearGuestIdentity } from "@/lib/guest";

const MIGRATED_FLAG = "nexplay:guest-scores-migrated";

const SLUG_ALIASES: Record<string, string> = {
  hanoi: "tower-of-hanoi",
  geoguessr: "geoguessr-clone",
  agar: "agar-clone",
};

type Entry = { slug: string; score: number };

export function GuestScoreMigration({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}) {
  const toast = useToast();
  useEffect(() => {
    if (!isAuthenticated) return;
    let alreadyDone = false;
    try {
      alreadyDone = localStorage.getItem(MIGRATED_FLAG) === "1";
    } catch {
      return;
    }
    if (alreadyDone) return;

    // Defer so we don't compete with first-paint work.
    const handle = setTimeout(() => {
      void migrateGuestScores(toast);
    }, 1500);
    return () => clearTimeout(handle);
  }, [isAuthenticated, toast]);

  return null;
}

async function migrateGuestScores(
  toast: ReturnType<typeof useToast>,
) {
  const entries: Entry[] = collectEntries();
  if (entries.length === 0) {
    try {
      localStorage.setItem(MIGRATED_FLAG, "1");
    } catch {
      // private mode
    }
    return;
  }

  let okCount = 0;
  for (const e of entries) {
    try {
      const res = await submitScore(e.slug, e.score);
      if (res.ok) okCount += 1;
    } catch {
      // counted as failure via the okCount tally
    }
  }
  const allOk = okCount === entries.length;

  if (allOk) {
    try {
      localStorage.setItem(MIGRATED_FLAG, "1");
      // Best scores migrated, no longer "a guest who has played"
      localStorage.removeItem("nexplay:was-guest");
      // Their guest random name (Whimsical Wombat 4815) is no longer
      // relevant — they have a real profile now.
      clearGuestIdentity();
    } catch {
      // ignore
    }
  }

  if (okCount > 0) {
    // Celebrate the migration so the user sees their guest progress
    // didn't vanish. Counting okCount (not entries.length) means a
    // partial success still gets a positive note, with the rest
    // retried on next page-load.
    toast({
      variant: "success",
      emoji: "🏆",
      title: `Synced ${okCount} ${okCount === 1 ? "score" : "scores"} to your account`,
      description:
        "Your guest progress is now on the global leaderboard. Welcome aboard!",
      durationMs: 6000,
    });
  }
  // If !allOk we leave the flag unset and the next mount retries.
}

function collectEntries(): Entry[] {
  const out: Entry[] = [];
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
  } catch {
    return out;
  }

  for (const key of keys) {
    // Pattern: nexplay:<slug>-best or nexplay:<slug>-best-<extra>
    // Lazy quantifier on the slug so `<slug>-best-x` parses correctly.
    const m = key.match(/^nexplay:([\w-]+?)-best(?:-(.+))?$/);
    if (!m) continue;
    const rawSlug = m[1];
    const slug = SLUG_ALIASES[rawSlug] ?? rawSlug;

    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      continue;
    }
    if (!raw) continue;
    const score = parseScore(raw);
    if (Number.isFinite(score) && score > 0) {
      out.push({ slug, score });
    }
  }
  return out;
}

/** A few games store the value as `{ moves, time, score }` (Tower of
 *  Hanoi) instead of a bare number. Try both forms. */
function parseScore(raw: string): number {
  const asNumber = Number(raw);
  if (!Number.isNaN(asNumber)) return asNumber;
  try {
    const obj = JSON.parse(raw);
    if (typeof obj === "number") return obj;
    if (obj && typeof obj.score === "number") return obj.score;
  } catch {
    // not JSON
  }
  return NaN;
}
