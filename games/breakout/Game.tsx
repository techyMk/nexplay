"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useKeyboard } from "../useGameLoop";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";

const W = 800;
const H = 540;
const PADDLE_W = 120;
const PADDLE_H = 14;
const BALL_R = 8;
const BRICK_ROWS = 6;
const BRICK_COLS = 12;
const BRICK_W = (W - 40) / BRICK_COLS;
const BRICK_H = 22;

type Brick = { x: number; y: number; alive: boolean; color: string };

const BRICK_COLORS = ["#ef4444", "#f97316", "#facc15", "#16a34a", "#06b6d4", "#7c5cff"];

function makeBricks(): Brick[] {
  const bricks: Brick[] = [];
  for (let r = 0; r < BRICK_ROWS; r++) {
    for (let c = 0; c < BRICK_COLS; c++) {
      bricks.push({
        x: 20 + c * BRICK_W,
        y: 60 + r * BRICK_H,
        alive: true,
        color: BRICK_COLORS[r % BRICK_COLORS.length],
      });
    }
  }
  return bricks;
}

export default function Breakout() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keys = useKeyboard();
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [lives, setLives] = useState(3);
  const [phase, setPhase] = useState<"ready" | "play" | "over" | "won">("ready");
  const [paused, setPaused] = useState(false);
  const submitStatus = useSubmitScoreOnGameOver("breakout", score, phase === "over" || phase === "won");

  const stateRef = useRef({
    paddleX: W / 2,
    bx: W / 2,
    by: H - 60,
    bvx: 0,
    bvy: 0,
    bricks: makeBricks(),
  });

  useEffect(() => setBest(Number(localStorage.getItem("nexplay:breakout-best") || 0)), []);

  const launch = useCallback(() => {
    if (phase === "over" || phase === "won") return;
    const st = stateRef.current;
    const angle = (Math.random() * 0.6 - 0.3) - Math.PI / 2;
    st.bvx = Math.cos(angle) * 380;
    st.bvy = Math.sin(angle) * 380;
    setPhase("play");
  }, [phase]);

  const reset = useCallback(() => {
    stateRef.current = { paddleX: W / 2, bx: W / 2, by: H - 60, bvx: 0, bvy: 0, bricks: makeBricks() };
    setScore(0);
    setLives(3);
    setPhase("ready");
    setPaused(false);
  }, []);

  const togglePause = useCallback(() => {
    if (phase !== "play") return;
    setPaused((p) => !p);
  }, [phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "ArrowUp") {
        e.preventDefault();
        if (phase === "ready") launch();
      } else if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, launch, togglePause]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      const k = keys.current;

      if (!paused) {
        if (k.has("ArrowLeft") || k.has("a")) st.paddleX -= 540 * dt;
        if (k.has("ArrowRight") || k.has("d")) st.paddleX += 540 * dt;
        st.paddleX = Math.max(PADDLE_W / 2, Math.min(W - PADDLE_W / 2, st.paddleX));
      }

      if (phase === "ready") {
        st.bx = st.paddleX;
        st.by = H - 60;
      }

      if (phase === "play" && !paused) {
        st.bx += st.bvx * dt;
        st.by += st.bvy * dt;
        if (st.bx < BALL_R) { st.bx = BALL_R; st.bvx *= -1; }
        if (st.bx > W - BALL_R) { st.bx = W - BALL_R; st.bvx *= -1; }
        if (st.by < BALL_R) { st.by = BALL_R; st.bvy *= -1; }
        // paddle
        if (
          st.by + BALL_R > H - 30 - PADDLE_H &&
          st.by + BALL_R < H - 30 &&
          Math.abs(st.bx - st.paddleX) < PADDLE_W / 2 + BALL_R &&
          st.bvy > 0
        ) {
          const offset = (st.bx - st.paddleX) / (PADDLE_W / 2);
          const angle = (-Math.PI / 2) + offset * (Math.PI / 3);
          const speed = Math.min(640, Math.hypot(st.bvx, st.bvy) * 1.02);
          st.bvx = Math.cos(angle) * speed;
          st.bvy = Math.sin(angle) * speed;
          st.by = H - 30 - PADDLE_H - BALL_R;
        }
        if (st.by > H + 40) {
          setLives((l) => {
            const nl = l - 1;
            if (nl <= 0) {
              setPhase("over");
              setScore((s) => {
                setBest((b) => {
                  const nb = Math.max(b, s);
                  localStorage.setItem("nexplay:breakout-best", String(nb));
                  return nb;
                });
                return s;
              });
            } else {
              setPhase("ready");
            }
            return Math.max(0, nl);
          });
        }
        // bricks
        let aliveCount = 0;
        for (const b of st.bricks) {
          if (!b.alive) continue;
          aliveCount++;
          if (
            st.bx + BALL_R > b.x &&
            st.bx - BALL_R < b.x + BRICK_W &&
            st.by + BALL_R > b.y &&
            st.by - BALL_R < b.y + BRICK_H
          ) {
            b.alive = false;
            setScore((s) => s + 10);
            // simple bounce: pick the side with smaller penetration
            const dxL = st.bx + BALL_R - b.x;
            const dxR = b.x + BRICK_W - (st.bx - BALL_R);
            const dyT = st.by + BALL_R - b.y;
            const dyB = b.y + BRICK_H - (st.by - BALL_R);
            const m = Math.min(dxL, dxR, dyT, dyB);
            if (m === dxL || m === dxR) st.bvx *= -1;
            else st.bvy *= -1;
            break;
          }
        }
        if (aliveCount === 0) {
          setPhase("won");
          setScore((s) => {
            setBest((b) => {
              const nb = Math.max(b, s);
              localStorage.setItem("nexplay:breakout-best", String(nb));
              return nb;
            });
            return s;
          });
        }
      }

      // draw
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#0a0218");
      grad.addColorStop(1, "#0b0d12");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      // bricks
      for (const b of st.bricks) {
        if (!b.alive) continue;
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x + 1, b.y + 1, BRICK_W - 2, BRICK_H - 2);
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fillRect(b.x + 2, b.y + 2, BRICK_W - 4, 4);
      }
      // paddle
      ctx.fillStyle = "#7c5cff";
      ctx.fillRect(st.paddleX - PADDLE_W / 2, H - 30 - PADDLE_H, PADDLE_W, PADDLE_H);
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fillRect(st.paddleX - PADDLE_W / 2, H - 30 - PADDLE_H, PADDLE_W, 3);
      // ball
      ctx.beginPath();
      ctx.fillStyle = "white";
      ctx.shadowColor = "white";
      ctx.shadowBlur = 12;
      ctx.arc(st.bx, st.by, BALL_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      // hud
      ctx.fillStyle = "white";
      ctx.font = "bold 20px system-ui";
      ctx.fillText(`Score: ${score}`, 14, 30);
      ctx.textAlign = "right";
      ctx.fillText("♥".repeat(lives), W - 14, 30);
      ctx.textAlign = "left";

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [keys, phase, paused, score, lives]);

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#0a0218] to-[#0b0d12] p-2 sm:p-3">
      <div className="shrink-0 flex items-center justify-center gap-2 mb-2 text-white text-xs flex-wrap">
        <span>Best: <b>{best}</b> · Arrow keys / A,D · Space to launch · P pauses</span>
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
          <canvas ref={canvasRef} width={W} height={H} className="absolute inset-0 w-full h-full block rounded-xl border border-white/10" />
          {paused && phase === "play" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/65 backdrop-blur-sm rounded-xl gap-2">
              <div className="text-5xl mb-1">⏸</div>
              <div className="text-3xl font-black text-white mb-1">Paused</div>
              <div className="text-white/70 text-xs mb-3">
                Press <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono">P</kbd> to resume
              </div>
              <button
                onClick={() => setPaused(false)}
                className="px-6 py-3 rounded-lg bg-white text-black font-bold hover:scale-105 transition-transform"
              >
                ▶ Resume
              </button>
            </div>
          )}
          {phase !== "play" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-xl gap-2 pointer-events-none">
              {phase === "ready" && <>
                <div className="text-3xl font-black text-white">Press space</div>
                <div className="text-white/80">to launch the ball</div>
              </>}
              {phase === "over" && <>
                <div className="text-4xl font-black text-white">Game over</div>
                <div className="text-white/80">Score: {score}</div>
                <ScoreStatus gameSlug="breakout" status={submitStatus} />
                <button onClick={(e) => { e.stopPropagation(); reset(); }} className="pointer-events-auto mt-2 px-6 py-3 rounded-lg bg-white text-black font-bold hover:scale-105 transition-transform">Play again</button>
              </>}
              {phase === "won" && <>
                <div className="text-4xl font-black text-white">🏆 You cleared it!</div>
                <div className="text-white/80">Score: {score}</div>
                <ScoreStatus gameSlug="breakout" status={submitStatus} />
                <button onClick={(e) => { e.stopPropagation(); reset(); }} className="pointer-events-auto mt-2 px-6 py-3 rounded-lg bg-white text-black font-bold hover:scale-105 transition-transform">Next round</button>
              </>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
