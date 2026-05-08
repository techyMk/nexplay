"use client";

import { useEffect, useRef, useState } from "react";
import { isSupabaseConfigured } from "./supabase/config";

type Status = "idle" | "submitting" | "submitted" | "error" | "anon";

export async function submitScore(
  gameSlug: string,
  score: number,
): Promise<{ ok: boolean; status: Status }> {
  if (!isSupabaseConfigured) {
    console.warn("[submitScore] Supabase not configured");
    return { ok: false, status: "anon" };
  }
  try {
    const res = await fetch("/api/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_slug: gameSlug, score }),
    });

    let body: { error?: string } | null = null;
    try {
      body = await res.json();
    } catch {
      // ignore non-JSON
    }

    if (res.status === 401) {
      console.info("[submitScore] not signed in", { gameSlug, score });
      return { ok: false, status: "anon" };
    }
    if (!res.ok) {
      console.error(
        `[submitScore] HTTP ${res.status} for ${gameSlug}: ${body?.error ?? "(no error message)"}`,
        { gameSlug, score, body },
      );
      return { ok: false, status: "error" };
    }
    return { ok: true, status: "submitted" };
  } catch (e) {
    console.error("[submitScore] threw", e, { gameSlug, score });
    return { ok: false, status: "error" };
  }
}

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
