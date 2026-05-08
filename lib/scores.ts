"use client";

import { useEffect, useRef, useState } from "react";
import { isSupabaseConfigured } from "./supabase/config";

type Status = "idle" | "submitting" | "submitted" | "error" | "anon";

export async function submitScore(
  gameSlug: string,
  score: number,
): Promise<{ ok: boolean; status: Status }> {
  if (!isSupabaseConfigured) return { ok: false, status: "anon" };
  try {
    const res = await fetch("/api/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_slug: gameSlug, score }),
    });
    if (res.status === 401) return { ok: false, status: "anon" };
    if (!res.ok) return { ok: false, status: "error" };
    return { ok: true, status: "submitted" };
  } catch {
    return { ok: false, status: "error" };
  }
}

/**
 * Submit the score once when `gameOver` rises from false to true.
 * Resets when the player starts a new run (gameOver returns to false).
 */
export function useSubmitScoreOnGameOver(
  gameSlug: string,
  score: number,
  gameOver: boolean,
) {
  const [status, setStatus] = useState<Status>("idle");
  const submittedThisRun = useRef(false);

  useEffect(() => {
    if (!gameOver) {
      submittedThisRun.current = false;
      setStatus("idle");
      return;
    }
    if (submittedThisRun.current) return;
    if (score <= 0) return;
    submittedThisRun.current = true;
    setStatus("submitting");
    submitScore(gameSlug, score).then((r) => setStatus(r.status));
  }, [gameOver, gameSlug, score]);

  return status;
}
