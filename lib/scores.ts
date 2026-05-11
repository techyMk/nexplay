"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isSupabaseConfigured } from "./supabase/config";
import { sound } from "./audio";
import { useToast } from "@/components/ToastProvider";
import { challengeById } from "./daily";
import { achievementById } from "./achievements";

type Status = "idle" | "submitting" | "submitted" | "error" | "anon";

type SubmitResult = {
  ok: boolean;
  status: Status;
  /** IDs of daily challenges this score newly satisfied. */
  completed?: string[];
  /** IDs of achievements newly unlocked by this score. */
  achievements?: string[];
};

export async function submitScore(
  gameSlug: string,
  score: number,
): Promise<SubmitResult> {
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

    let body:
      | { error?: string; completed?: string[]; achievements?: string[] }
      | null = null;
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
    return {
      ok: true,
      status: "submitted",
      completed: body?.completed ?? [],
      achievements: body?.achievements ?? [],
    };
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
  const toast = useToast();
  const router = useRouter();

  useEffect(() => {
    if (!gameOver) {
      submittedThisRun.current = false;
      setStatus("idle");
      return;
    }
    if (submittedThisRun.current) return;
    if (score <= 0) return;
    submittedThisRun.current = true;
    sound.play("pop");
    setStatus("submitting");
    submitScore(gameSlug, score).then((r) => {
      setStatus(r.status);

      // Guest user: pitch sign-in once per session. The
      // sessionStorage flag means we only nag them on the first
      // game they end, not on every game-over for an hour.
      if (r.status === "anon") {
        try {
          const FLAG = "nexplay:guest-toast-shown";
          if (!sessionStorage.getItem(FLAG)) {
            sessionStorage.setItem(FLAG, "1");
            toast({
              variant: "default",
              emoji: "🏆",
              title: "Save your score!",
              description:
                "Sign in to keep your scores, compete on the global leaderboard, and play live with friends.",
              action: {
                label: "Sign in",
                href: `/login?next=/game/${gameSlug}`,
              },
              durationMs: 7000,
            });
          }
        } catch {
          // sessionStorage can throw in private mode — fall through silently
        }
      }

      // Daily challenge completion toasts
      if (r.completed && r.completed.length > 0) {
        for (const id of r.completed) {
          const ch = challengeById(id);
          if (!ch) continue;
          toast({
            variant: "daily",
            emoji: "🎯",
            title: "Daily challenge complete!",
            description: `${ch.title} — ${ch.description}`,
            durationMs: 5500,
          });
        }
      }

      // Achievement unlock toasts
      if (r.achievements && r.achievements.length > 0) {
        for (const id of r.achievements) {
          const a = achievementById(id);
          if (!a) continue;
          toast({
            variant: "achievement",
            emoji: a.emoji,
            title: "Achievement unlocked!",
            description: `${a.title} — ${a.description}`,
            durationMs: 6000,
          });
        }
      }

      // Refresh server components so the user's next visit to /daily,
      // /achievements, or /profile reflects the new state without a
      // manual reload.
      if (r.ok) {
        router.refresh();
      }
    });
  }, [gameOver, gameSlug, score, toast, router]);

  return status;
}
