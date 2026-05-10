"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";
import { GameOverlay, PauseToggle } from "@/components/games/GameOverlay";

const COLS = 24;
const ROWS = 18;
const CELL = 22;
const W = COLS * CELL;
const H = ROWS * CELL;

type Pt = { x: number; y: number };
type Dir = "up" | "down" | "left" | "right";

const VEC: Record<Dir, Pt> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPP: Record<Dir, Dir> = {
  up: "down", down: "up", left: "right", right: "left",
};

function spawnFood(snake: Pt[]): Pt {
  while (true) {
    const f = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
    if (!snake.some((s) => s.x === f.x && s.y === f.y)) return f;
  }
}

export default function Snake() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState(false);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const submitStatus = useSubmitScoreOnGameOver("snake", score, over);

  const stateRef = useRef({
    snake: [{ x: 12, y: 9 }, { x: 11, y: 9 }, { x: 10, y: 9 }] as Pt[],
    dir: "right" as Dir,
    nextDir: "right" as Dir,
    food: { x: 16, y: 9 } as Pt,
    acc: 0,
    speed: 8, // moves per second
  });

  useEffect(() => {
    const stored = Number(localStorage.getItem("nexplay:snake-best") || 0);
    setBest(stored);
  }, []);

  const reset = useCallback(() => {
    stateRef.current = {
      snake: [{ x: 12, y: 9 }, { x: 11, y: 9 }, { x: 10, y: 9 }],
      dir: "right",
      nextDir: "right",
      food: spawnFood([{ x: 12, y: 9 }, { x: 11, y: 9 }, { x: 10, y: 9 }]),
      acc: 0,
      speed: 8,
    };
    setScore(0);
    setOver(false);
    setRunning(false);
    setStarted(false);
    setPaused(false);
  }, []);

  const start = useCallback(() => {
    setStarted(true);
    setRunning(true);
    setPaused(false);
  }, []);

  const togglePause = useCallback(() => {
    if (over || !started) return;
    setPaused((p) => !p);
  }, [over, started]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        e.preventDefault();
        togglePause();
        return;
      }
      const map: Record<string, Dir> = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
        w: "up", s: "down", a: "left", d: "right",
      };
      const d = map[e.key];
      if (!d) return;
      e.preventDefault();
      const cur = stateRef.current.dir;
      if (OPP[cur] !== d) stateRef.current.nextDir = d;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePause]);

  // Touch swipe input — direction follows the swipe vector. Sensitivity
  // is intentionally low (~16px) so a quick flick registers cleanly.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let startX = 0;
    let startY = 0;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
    };
    const onEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) < 16 && Math.abs(dy) < 16) return;
      const dir: Dir =
        Math.abs(dx) > Math.abs(dy)
          ? dx > 0
            ? "right"
            : "left"
          : dy > 0
            ? "down"
            : "up";
      const cur = stateRef.current.dir;
      if (OPP[cur] !== dir) stateRef.current.nextDir = dir;
    };
    canvas.addEventListener("touchstart", onStart, { passive: true });
    canvas.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      canvas.removeEventListener("touchstart", onStart);
      canvas.removeEventListener("touchend", onEnd);
    };
  }, []);

  useEffect(() => {
    if (!running || paused) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const st = stateRef.current;
      st.acc += dt;
      const step = 1 / st.speed;

      while (st.acc >= step) {
        st.acc -= step;
        st.dir = st.nextDir;
        const head = st.snake[0];
        const v = VEC[st.dir];
        const nh = { x: head.x + v.x, y: head.y + v.y };
        if (
          nh.x < 0 || nh.x >= COLS || nh.y < 0 || nh.y >= ROWS ||
          st.snake.some((s) => s.x === nh.x && s.y === nh.y)
        ) {
          setOver(true);
          setRunning(false);
          setScore((s) => {
            setBest((b) => {
              const nb = Math.max(b, s);
              localStorage.setItem("nexplay:snake-best", String(nb));
              return nb;
            });
            return s;
          });
          return;
        }
        st.snake.unshift(nh);
        if (nh.x === st.food.x && nh.y === st.food.y) {
          st.food = spawnFood(st.snake);
          setScore((s) => s + 10);
          st.speed = Math.min(18, st.speed + 0.25);
        } else {
          st.snake.pop();
        }
      }

      // draw
      ctx.fillStyle = "#0b0d12";
      ctx.fillRect(0, 0, W, H);
      // grid
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= COLS; x++) {
        ctx.beginPath();
        ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, H);
        ctx.stroke();
      }
      for (let y = 0; y <= ROWS; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * CELL); ctx.lineTo(W, y * CELL);
        ctx.stroke();
      }
      // food
      ctx.fillStyle = "#ff5cae";
      ctx.beginPath();
      ctx.arc(st.food.x * CELL + CELL / 2, st.food.y * CELL + CELL / 2, CELL / 2 - 3, 0, Math.PI * 2);
      ctx.fill();
      // snake
      st.snake.forEach((s, i) => {
        const t = i / st.snake.length;
        ctx.fillStyle = i === 0 ? "#7c5cff" : `rgba(124,92,255,${1 - t * 0.6})`;
        ctx.fillRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2);
      });

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, paused]);

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#0a1f0d] to-[#0b0d12] p-2 sm:p-3">
      <div className="shrink-0 flex items-center justify-center gap-2 mb-2 text-white text-xs sm:text-sm flex-wrap">
        <span className="px-3 py-1 rounded-lg bg-white/10">Score: <b>{score}</b></span>
        <span className="px-3 py-1 rounded-lg bg-white/10">Best: <b>{best}</b></span>
        {started && !over && (
          <PauseToggle paused={paused} onClick={togglePause} />
        )}
      </div>
      <div className="flex-1 min-h-0 w-full flex items-center justify-center">
        <div
          className="relative h-full max-w-full"
          style={{ aspectRatio: `${W} / ${H}` }}
        >
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="absolute inset-0 w-full h-full block rounded-xl border border-white/10"
          />
          {!started && !over && (
            <GameOverlay
              icon="🐍"
              title="Snake"
              subtitle="Eat the pink dots, grow longer, don't bite yourself."
              primary={{ label: "▶ Play", onClick: start }}
            />
          )}
          {paused && started && !over && (
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
              primary={{ label: "▶ Resume", onClick: () => setPaused(false) }}
            />
          )}
          {over && (
            <GameOverlay
              icon="💀"
              title="Game over"
              subtitle={`Score: ${score}`}
              primary={{ label: "Play again", onClick: reset }}
            >
              <ScoreStatus gameSlug="snake" status={submitStatus} />
            </GameOverlay>
          )}
        </div>
      </div>
      <div className="shrink-0 mt-2 text-[11px] text-white/60 text-center">Arrow keys / WASD · Swipe on mobile</div>
    </div>
  );
}
