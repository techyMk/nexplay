"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";

const W = 480;
const H = 640;
const BIRD_X = 120;
const BIRD_R = 14;
const GAP = 160;
const PIPE_W = 70;
const PIPE_GAP_X = 220;
const GRAVITY = 1500;
const FLAP = -420;

type Pipe = { x: number; gapY: number; passed: boolean };

function makeInitialPipes(): Pipe[] {
  return [
    { x: W + 200, gapY: 100 + Math.random() * (H - 200 - GAP), passed: false },
    {
      x: W + 200 + PIPE_GAP_X,
      gapY: 100 + Math.random() * (H - 200 - GAP),
      passed: false,
    },
  ];
}

export default function Flappy() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [phase, setPhase] = useState<"ready" | "play" | "over">("ready");
  const [paused, setPaused] = useState(false);
  const submitStatus = useSubmitScoreOnGameOver("flappy", score, phase === "over");

  const stateRef = useRef({
    y: H / 2,
    vy: 0,
    pipes: makeInitialPipes(),
    nextPipeAt: 0,
  });

  useEffect(() => {
    setBest(Number(localStorage.getItem("nexplay:flappy-best") || 0));
  }, []);

  const reset = useCallback(() => {
    stateRef.current = {
      y: H / 2,
      vy: 0,
      pipes: makeInitialPipes(),
      nextPipeAt: 0,
    };
    setScore(0);
    setPhase("ready");
    setPaused(false);
  }, []);

  const togglePause = useCallback(() => {
    if (phase !== "play") return;
    setPaused((p) => !p);
  }, [phase]);

  const flap = useCallback(() => {
    if (phase === "ready") setPhase("play");
    if (phase === "over") return;
    if (paused) {
      setPaused(false);
      return;
    }
    stateRef.current.vy = FLAP;
  }, [phase, paused]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "ArrowUp") {
        e.preventDefault();
        flap();
      } else if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flap, togglePause]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const st = stateRef.current;

      if (phase === "play" && !paused) {
        st.vy += GRAVITY * dt;
        st.y += st.vy * dt;

        // pipes scroll
        for (const p of st.pipes) p.x -= 200 * dt;
        if (st.pipes.length > 0 && st.pipes[0].x < -PIPE_W) {
          st.pipes.shift();
          const lastX = st.pipes.length > 0
            ? st.pipes[st.pipes.length - 1].x
            : W;
          st.pipes.push({
            x: lastX + PIPE_GAP_X,
            gapY: 100 + Math.random() * (H - 200 - GAP),
            passed: false,
          });
        }

        // collisions
        if (st.y + BIRD_R > H || st.y - BIRD_R < 0) {
          setPhase("over");
        }
        for (const p of st.pipes) {
          if (
            BIRD_X + BIRD_R > p.x &&
            BIRD_X - BIRD_R < p.x + PIPE_W &&
            (st.y - BIRD_R < p.gapY || st.y + BIRD_R > p.gapY + GAP)
          ) {
            setPhase("over");
          }
          if (!p.passed && p.x + PIPE_W < BIRD_X) {
            p.passed = true;
            setScore((s) => {
              const n = s + 1;
              setBest((b) => {
                const nb = Math.max(b, n);
                localStorage.setItem("nexplay:flappy-best", String(nb));
                return nb;
              });
              return n;
            });
          }
        }
      }

      // background
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#3a8ec9");
      grad.addColorStop(1, "#7ad9c1");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // pipes
      ctx.fillStyle = "#16a34a";
      for (const p of st.pipes) {
        ctx.fillRect(p.x, 0, PIPE_W, p.gapY);
        ctx.fillRect(p.x, p.gapY + GAP, PIPE_W, H - p.gapY - GAP);
        ctx.fillStyle = "#15803d";
        ctx.fillRect(p.x - 4, p.gapY - 16, PIPE_W + 8, 16);
        ctx.fillRect(p.x - 4, p.gapY + GAP, PIPE_W + 8, 16);
        ctx.fillStyle = "#16a34a";
      }

      // ground
      ctx.fillStyle = "#facc15";
      ctx.fillRect(0, H - 6, W, 6);

      // bird
      ctx.save();
      ctx.translate(BIRD_X, st.y);
      ctx.rotate(Math.max(-0.3, Math.min(1, st.vy / 600)));
      ctx.fillStyle = "#facc15";
      ctx.beginPath();
      ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(5, -4, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f97316";
      ctx.beginPath();
      ctx.moveTo(BIRD_R - 2, 0);
      ctx.lineTo(BIRD_R + 8, 2);
      ctx.lineTo(BIRD_R - 2, 6);
      ctx.fill();
      ctx.restore();

      // score
      ctx.fillStyle = "white";
      ctx.font = "bold 48px system-ui";
      ctx.textAlign = "center";
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 4;
      ctx.strokeText(String(score), W / 2, 80);
      ctx.fillText(String(score), W / 2, 80);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, paused, score]);

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#0a1a2a] to-[#1a3344] p-2 sm:p-3">
      <div className="shrink-0 flex items-center justify-center gap-2 mb-2 text-white text-xs">
        <span>Best: <b>{best}</b></span>
        {phase === "play" && (
          <button
            onClick={togglePause}
            className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 font-bold transition-colors"
          >
            {paused ? "▶ Resume" : "⏸ Pause"}
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0 w-full flex items-center justify-center">
        <div className="relative h-full max-w-full" style={{ aspectRatio: `${W} / ${H}` }}>
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            onClick={flap}
            onTouchStart={(e) => { e.preventDefault(); flap(); }}
            className="absolute inset-0 w-full h-full block rounded-xl border border-white/10 cursor-pointer"
          />
          {paused && phase === "play" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/65 backdrop-blur-sm rounded-xl gap-2">
              <div className="text-5xl mb-1">⏸</div>
              <div className="text-3xl font-black text-white mb-1">Paused</div>
              <div className="text-white/70 text-xs mb-3">
                Press <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono">P</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono">Space</kbd> to resume
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPaused(false);
                }}
                className="px-6 py-3 rounded-lg bg-white text-black font-bold hover:scale-105 transition-transform"
              >
                ▶ Resume
              </button>
            </div>
          )}
          {phase !== "play" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-xl pointer-events-none">
              {phase === "ready" ? (
                <>
                  <div className="text-3xl font-black text-white mb-2">Tap or press Space</div>
                  <div className="text-white/80">to flap · P pauses</div>
                </>
              ) : (
                <>
                  <div className="text-4xl font-black text-white mb-2">Game over</div>
                  <div className="text-white/80 mb-2">Score: {score}</div>
                  <div className="pointer-events-auto mb-3">
                    <ScoreStatus gameSlug="flappy" status={submitStatus} />
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); reset(); }}
                    className="pointer-events-auto px-6 py-3 rounded-lg bg-white text-black font-bold hover:scale-105 transition-transform"
                  >
                    Try again
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
