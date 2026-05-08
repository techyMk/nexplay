"use client";

import { useEffect, useRef, useState } from "react";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";

const HOLES = 9;
const ROUND_SECONDS = 30;

type Hole = { up: boolean; bonk: boolean; deadline: number };

export default function WhackAMole() {
  const [holes, setHoles] = useState<Hole[]>(() =>
    Array.from({ length: HOLES }, () => ({ up: false, bonk: false, deadline: 0 })),
  );
  const [score, setScore] = useState(0);
  const [time, setTime] = useState(ROUND_SECONDS);
  const [phase, setPhase] = useState<"ready" | "play" | "over">("ready");
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
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#1a0f08] to-[#0b0d12] p-4 select-none">
      <div className="flex items-center gap-3 mb-3 text-white text-sm">
        <span className="px-3 py-1 rounded-lg bg-white/10">🎯 {score}</span>
        <span className="px-3 py-1 rounded-lg bg-white/10">⏱️ {time}s</span>
        <span className="px-3 py-1 rounded-lg bg-white/10">🏆 {best}</span>
      </div>
      <div
        className="grid grid-cols-3 gap-3 p-4 rounded-2xl bg-gradient-to-b from-amber-900/40 to-amber-950/40 border border-amber-900/30"
        style={{ width: "min(75vh, 480px)", aspectRatio: "1" }}
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
      <div className="mt-2 text-[10px] text-white/50">Click moles when they pop up</div>
      {phase === "ready" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 gap-3">
          <div className="text-5xl">🐹</div>
          <div className="text-3xl font-black text-white">Whack-a-Mole</div>
          <div className="text-white/80">{ROUND_SECONDS} seconds. Get as many as you can.</div>
          <button onClick={start} className="mt-2 px-6 py-3 rounded-lg bg-white text-black font-bold hover:scale-105 transition-transform">
            Start
          </button>
        </div>
      )}
      {phase === "over" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-2">
          <div className="text-4xl font-black text-white">Time&apos;s up!</div>
          <div className="text-white/80">Score: {score}</div>
          <ScoreStatus gameSlug="whack-a-mole" status={submitStatus} />
          <button onClick={start} className="mt-2 px-6 py-3 rounded-lg bg-white text-black font-bold hover:scale-105 transition-transform">
            Play again
          </button>
        </div>
      )}
    </div>
  );
}
