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

export default function Flappy() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [phase, setPhase] = useState<"ready" | "play" | "over">("ready");
  const submitStatus = useSubmitScoreOnGameOver("flappy", score, phase === "over");

  const stateRef = useRef({
    y: H / 2,
    vy: 0,
    pipes: [] as Pipe[],
    nextPipeAt: 0,
  });

  useEffect(() => {
    setBest(Number(localStorage.getItem("nexplay:flappy-best") || 0));
  }, []);

  const reset = useCallback(() => {
    stateRef.current = {
      y: H / 2,
      vy: 0,
      pipes: [
        { x: W + 200, gapY: 200 + Math.random() * (H - 400), passed: false },
        { x: W + 200 + PIPE_GAP_X, gapY: 200 + Math.random() * (H - 400), passed: false },
      ],
      nextPipeAt: 0,
    };
    setScore(0);
    setPhase("ready");
  }, []);

  const flap = useCallback(() => {
    if (phase === "ready") setPhase("play");
    if (phase === "over") return;
    stateRef.current.vy = FLAP;
  }, [phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "ArrowUp") {
        e.preventDefault();
        flap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flap]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const st = stateRef.current;

      if (phase === "play") {
        st.vy += GRAVITY * dt;
        st.y += st.vy * dt;

        // pipes scroll
        for (const p of st.pipes) p.x -= 200 * dt;
        if (st.pipes[0].x < -PIPE_W) {
          st.pipes.shift();
          st.pipes.push({
            x: st.pipes[st.pipes.length - 1].x + PIPE_GAP_X,
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
  }, [phase, score]);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#0a1a2a] to-[#1a3344] p-4">
      <div className="text-white text-xs mb-2">
        Best: <b>{best}</b>
      </div>
      <div className="relative" style={{ width: "min(90vw, 480px)", height: "min(80vh, 640px)" }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onClick={flap}
          onTouchStart={(e) => { e.preventDefault(); flap(); }}
          className="rounded-xl border border-white/10 cursor-pointer w-full h-full"
        />
        {phase !== "play" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-xl pointer-events-none">
            {phase === "ready" ? (
              <>
                <div className="text-3xl font-black text-white mb-2">Tap or press Space</div>
                <div className="text-white/80">to flap</div>
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
  );
}
