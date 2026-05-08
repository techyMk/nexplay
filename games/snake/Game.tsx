"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";

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
  const [running, setRunning] = useState(true);
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
    setRunning(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
  }, []);

  useEffect(() => {
    if (!running) return;
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
  }, [running]);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#0a1f0d] to-[#0b0d12] p-4">
      <div className="flex items-center gap-3 mb-3 text-white text-sm">
        <span className="px-3 py-1 rounded-lg bg-white/10">Score: <b>{score}</b></span>
        <span className="px-3 py-1 rounded-lg bg-white/10">Best: <b>{best}</b></span>
      </div>
      <div className="relative" style={{ maxWidth: "100%", maxHeight: "75%" }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="rounded-xl border border-white/10"
          style={{ width: "min(80vh, 528px)", aspectRatio: `${W}/${H}`, height: "auto" }}
        />
        {over && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded-xl gap-2">
            <div className="text-3xl font-black text-white mb-1">Game over</div>
            <div className="text-white/80">Score: {score}</div>
            <ScoreStatus gameSlug="snake" status={submitStatus} />
            <button
              onClick={reset}
              className="mt-2 px-6 py-3 rounded-lg bg-white text-black font-bold hover:scale-105 transition-transform"
            >
              Play again
            </button>
          </div>
        )}
      </div>
      <div className="mt-3 text-xs text-white/60">Arrow keys / WASD</div>
    </div>
  );
}
