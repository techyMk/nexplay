"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useKeyboard } from "../useGameLoop";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";
import { GameOverlay, PauseToggle } from "@/components/games/GameOverlay";
import { SoundToggle } from "@/components/SoundToggle";
import { Sfx } from "@/lib/sound";

const COLS = 20;
const ROWS = 14;
const CELL = 32;
const W = COLS * CELL;
const H = ROWS * CELL;

// 1 = wall, 0 = floor, 2 = treasure, 3 = exit
const LEVEL: number[][] = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,1,0,0,0,0,0,0,1,0,0,0,2,0,0,1],
  [1,0,1,1,0,1,0,1,1,1,1,0,1,0,1,1,1,1,0,1],
  [1,0,1,2,0,0,0,1,0,0,0,0,0,0,0,0,0,1,0,1],
  [1,0,1,1,1,1,1,1,0,1,1,1,1,1,1,1,0,1,0,1],
  [1,0,0,0,0,0,0,0,0,1,2,0,0,0,0,1,0,1,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,1,0,0,0,1],
  [1,0,0,0,2,0,1,0,0,0,0,0,0,1,0,1,1,1,0,1],
  [1,0,1,1,1,0,1,0,1,1,1,1,0,1,0,0,0,1,0,1],
  [1,0,1,0,0,0,1,0,1,2,0,1,0,1,1,1,0,1,0,1],
  [1,0,1,0,1,1,1,0,1,1,0,1,0,0,0,0,0,1,0,1],
  [1,0,0,0,1,0,0,0,0,0,0,1,1,1,1,1,1,1,0,1],
  [1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,3,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

function makeGrid(): number[][] {
  return LEVEL.map((row) => [...row]);
}

export default function TreasureHunt() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keys = useKeyboard();
  const [coins, setCoins] = useState(0);
  const [total] = useState(LEVEL.flat().filter((v) => v === 2).length);
  const [won, setWon] = useState(false);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [time, setTime] = useState(0);
  const finalScore = won ? coins * 100 + Math.max(0, 600 - time) : 0;
  const submitStatus = useSubmitScoreOnGameOver("treasure-hunt", finalScore, won);
  const startedRef = useRef(false);
  startedRef.current = started;
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  const stateRef = useRef({
    grid: makeGrid(),
    px: 1.5,
    py: 1.5,
    moveCool: 0,
    elapsed: 0,
  });

  const reset = useCallback(() => {
    stateRef.current = { grid: makeGrid(), px: 1.5, py: 1.5, moveCool: 0, elapsed: 0 };
    setCoins(0);
    setWon(false);
    setTime(0);
    setStarted(false);
    setPaused(false);
  }, []);

  const start = useCallback(() => {
    setStarted(true);
    setPaused(false);
  }, []);

  const togglePause = useCallback(() => {
    if (won || !startedRef.current) return;
    setPaused((p) => !p);
  }, [won]);

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
    if (won) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();

    const tryMove = (dx: number, dy: number) => {
      const st = stateRef.current;
      const nx = st.px + dx;
      const ny = st.py + dy;
      const cx = Math.floor(nx);
      const cy = Math.floor(ny);
      if (st.grid[cy]?.[cx] === 1) return;
      st.px = nx;
      st.py = ny;
      const cell = st.grid[Math.floor(st.py)][Math.floor(st.px)];
      if (cell === 2) {
        st.grid[Math.floor(st.py)][Math.floor(st.px)] = 0;
        setCoins((c) => c + 1);
        Sfx.pickup();
      }
      if (cell === 3) {
        setWon(true);
        Sfx.win();
      }
    };

    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      const k = keys.current;
      const live = startedRef.current && !pausedRef.current;

      if (live) {
        st.elapsed += dt;
        setTime(Math.floor(st.elapsed));

        const speed = 5; // cells per second
        let dx = 0,
          dy = 0;
        if (k.has("ArrowLeft") || k.has("a")) dx -= 1;
        if (k.has("ArrowRight") || k.has("d")) dx += 1;
        if (k.has("ArrowUp") || k.has("w")) dy -= 1;
        if (k.has("ArrowDown") || k.has("s")) dy += 1;
        if (dx || dy) {
          const len = Math.hypot(dx, dy) || 1;
          tryMove((dx / len) * speed * dt, 0);
          tryMove(0, (dy / len) * speed * dt);
        }
      }

      // draw
      ctx.fillStyle = "#0b0d12";
      ctx.fillRect(0, 0, W, H);
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const v = st.grid[r][c];
          const x = c * CELL, y = r * CELL;
          if (v === 1) {
            ctx.fillStyle = "#3a2812";
            ctx.fillRect(x, y, CELL, CELL);
            ctx.fillStyle = "rgba(255,255,255,0.05)";
            ctx.fillRect(x, y, CELL, 4);
          } else {
            ctx.fillStyle = "#1a1208";
            ctx.fillRect(x, y, CELL, CELL);
          }
          if (v === 2) {
            ctx.fillStyle = "#facc15";
            ctx.beginPath();
            ctx.arc(x + CELL / 2, y + CELL / 2, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "white";
            ctx.beginPath();
            ctx.arc(x + CELL / 2 - 2, y + CELL / 2 - 2, 2, 0, Math.PI * 2);
            ctx.fill();
          }
          if (v === 3) {
            ctx.fillStyle = "#16a34a";
            ctx.fillRect(x + 4, y + 4, CELL - 8, CELL - 8);
            ctx.fillStyle = "white";
            ctx.font = "bold 16px system-ui";
            ctx.textAlign = "center";
            ctx.fillText("EXIT", x + CELL / 2, y + CELL / 2 + 6);
            ctx.textAlign = "left";
          }
        }
      }
      // player
      const px = st.px * CELL, py = st.py * CELL;
      ctx.fillStyle = "#7c5cff";
      ctx.shadowColor = "#7c5cff";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(px, py, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [keys, won]);

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#1a1208] to-[#0b0d12] p-2 sm:p-3">
      <div className="shrink-0 flex items-center justify-center gap-2 mb-2 text-white text-xs sm:text-sm flex-wrap">
        <SoundToggle />
        <span className="px-3 py-1 rounded-lg bg-white/10">💰 {coins}/{total}</span>
        <span className="px-3 py-1 rounded-lg bg-white/10">⏱️ {time}s</span>
        {started && !won && (
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
          {!started && !won && (
            <GameOverlay
              icon="🗝️"
              title="Treasure Hunt"
              subtitle="Collect the coins and reach the green EXIT. Faster is better."
              primary={{ label: "▶ Play", onClick: start }}
            />
          )}
          {paused && started && !won && (
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
          {won && (
            <GameOverlay
              icon="🏆"
              title="You escaped!"
              subtitle={`${coins}/${total} treasures · ${time}s`}
              primary={{ label: "Play again", onClick: reset }}
            >
              <div className="text-2xl font-black text-[var(--accent)]">
                Score: {finalScore}
              </div>
              <ScoreStatus gameSlug="treasure-hunt" status={submitStatus} />
            </GameOverlay>
          )}
        </div>
      </div>
      <div className="shrink-0 mt-2 text-xs text-white/60 text-center">
        WASD / Arrow keys · P pauses
      </div>
    </div>
  );
}
