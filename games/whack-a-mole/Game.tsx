"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";
import { GameOverlay, PauseToggle } from "@/components/games/GameOverlay";

const HOLES = 9;
const ROUND_SECONDS = 30;

type Hole = { up: boolean; bonk: boolean; deadline: number };

export default function WhackAMole() {
  const [holes, setHoles] = useState<Hole[]>(() =>
    Array.from({ length: HOLES }, () => ({ up: false, bonk: false, deadline: 0 })),
  );
  const [score, setScore] = useState(0);
  const [time, setTime] = useState(ROUND_SECONDS);
  const [phase, setPhase] = useState<"ready" | "play" | "paused" | "over">("ready");
  const [best, setBest] = useState(0);
  const submitStatus = useSubmitScoreOnGameOver("whack-a-mole", score, phase === "over");
  const tickRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => setBest(Number(localStorage.getItem("nexplay:whack-best") || 0)), []);

  const start = () => {
    setHoles(Array.from({ length: HOLES }, () => ({ up: false, bonk: false, deadline: 0 })));
    setScore(0);
    setTime(ROUND_SECONDS);
    setPhase("play");
  };

  const togglePause = useCallback(() => {
    setPhase((p) => (p === "play" ? "paused" : p === "paused" ? "play" : p));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePause]);

  useEffect(() => {
    if (phase !== "play") return;
    let elapsed = 0;
    tickRef.current = setInterval(() => {
      elapsed += 0.1;
      const now = performance.now();
      // tick down time
      if (elapsed % 1 < 0.1) setTime((t) => Math.max(0, t - 1));
      // chance to pop a mole
      setHoles((hs) => {
        const next = hs.map((h) => {
          if (h.up && now > h.deadline) return { up: false, bonk: false, deadline: 0 };
          return h;
        });
        const upCount = next.filter((h) => h.up).length;
        if (upCount < 3 && Math.random() < 0.45) {
          const candidates = next
            .map((h, i) => (h.up ? -1 : i))
            .filter((i) => i >= 0);
          if (candidates.length) {
            const idx = candidates[Math.floor(Math.random() * candidates.length)];
            const lifetime = 600 + Math.random() * 600;
            next[idx] = { up: true, bonk: false, deadline: now + lifetime };
          }
        }
        return next;
      });
    }, 100);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [phase]);

  useEffect(() => {
    if (time === 0 && phase === "play") {
      setPhase("over");
      setBest((b) => {
        const nb = Math.max(b, score);
        localStorage.setItem("nexplay:whack-best", String(nb));
        return nb;
      });
    }
  }, [time, phase, score]);

  const whack = (i: number) => {
    if (phase !== "play") return;
    setHoles((hs) => {
      const next = [...hs];
      if (next[i].up && !next[i].bonk) {
        next[i] = { up: true, bonk: true, deadline: performance.now() + 200 };
        setScore((s) => s + 10);
      }
      return next;
    });
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#1a0f08] to-[#0b0d12] p-2 sm:p-3 select-none">
      <div className="shrink-0 flex items-center justify-center gap-3 mb-2 text-white text-xs sm:text-sm flex-wrap">
        <span className="px-3 py-1 rounded-lg bg-white/10">🎯 {score}</span>
        <span className="px-3 py-1 rounded-lg bg-white/10">⏱️ {time}s</span>
        <span className="px-3 py-1 rounded-lg bg-white/10">🏆 {best}</span>
        {(phase === "play" || phase === "paused") && (
          <PauseToggle paused={phase === "paused"} onClick={togglePause} />
        )}
      </div>
      <div className="flex-1 min-h-0 w-full flex items-center justify-center">
      <div
        className="grid grid-cols-3 grid-rows-3 gap-3 p-3 sm:p-4 rounded-2xl bg-gradient-to-b from-amber-900/40 to-amber-950/40 border border-amber-900/30 h-full max-w-full"
        style={{ aspectRatio: "1" }}
      >
        {holes.map((h, i) => (
          <button
            key={i}
            onClick={() => whack(i)}
            className="relative rounded-full bg-black/60 border-4 border-amber-950/60 overflow-hidden cursor-pointer hover:scale-[1.02] active:scale-95 transition-transform"
          >
            <div
              className="absolute inset-x-0 transition-all flex items-end justify-center"
              style={{
                bottom: h.up ? "8%" : "-100%",
                transitionDuration: h.bonk ? "120ms" : "180ms",
              }}
            >
              <div className="text-5xl drop-shadow-2xl">
                {h.bonk ? "💥" : "🐹"}
              </div>
            </div>
          </button>
        ))}
      </div>
      </div>
      <div className="shrink-0 mt-2 text-[10px] text-white/50 text-center">Click moles when they pop up</div>
      {phase === "ready" && (
        <GameOverlay
          icon="🐹"
          title="Whack-a-Mole"
          subtitle={`${ROUND_SECONDS} seconds. Get as many as you can.`}
          primary={{ label: "▶ Start", onClick: start }}
        />
      )}
      {phase === "paused" && (
        <GameOverlay
          variant="blur"
          icon="⏸"
          title="Paused"
          subtitle={
            <>
              Press{" "}
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono">P</kbd>{" "}
              to resume
            </>
          }
          primary={{ label: "▶ Resume", onClick: togglePause }}
        />
      )}
      {phase === "over" && (
        <GameOverlay
          icon="⏱️"
          title="Time's up!"
          subtitle={`Score: ${score}`}
          primary={{ label: "Play again", onClick: start }}
        >
          <ScoreStatus gameSlug="whack-a-mole" status={submitStatus} />
        </GameOverlay>
      )}
    </div>
  );
}
