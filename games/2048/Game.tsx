"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";
import { GameOverlay, PauseToggle } from "@/components/games/GameOverlay";

type Board = number[][];

const SIZE = 4;

const COLORS: Record<number, string> = {
  0: "#1c2230",
  2: "#3b3050",
  4: "#4a3d68",
  8: "#7c5cff",
  16: "#9a4cd6",
  32: "#c84cb8",
  64: "#ff5cae",
  128: "#ff7a3a",
  256: "#ffa83a",
  512: "#ffd23a",
  1024: "#7af4c1",
  2048: "#3afff0",
};

function emptyBoard(): Board {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function clone(b: Board): Board {
  return b.map((r) => [...r]);
}

function addRandom(b: Board): Board {
  const empty: [number, number][] = [];
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) if (b[r][c] === 0) empty.push([r, c]);
  if (empty.length === 0) return b;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  const next = clone(b);
  next[r][c] = Math.random() < 0.9 ? 2 : 4;
  return next;
}

function compress(row: number[]): { row: number[]; gained: number } {
  const filtered = row.filter((v) => v !== 0);
  let gained = 0;
  for (let i = 0; i < filtered.length - 1; i++) {
    if (filtered[i] === filtered[i + 1]) {
      filtered[i] *= 2;
      gained += filtered[i];
      filtered.splice(i + 1, 1);
    }
  }
  while (filtered.length < SIZE) filtered.push(0);
  return { row: filtered, gained };
}

function rotate(b: Board): Board {
  const n: Board = emptyBoard();
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) n[c][SIZE - 1 - r] = b[r][c];
  return n;
}

type Dir = "left" | "right" | "up" | "down";

function move(b: Board, dir: Dir): { board: Board; moved: boolean; gained: number } {
  let work = clone(b);
  const rotations = { left: 0, up: 1, right: 2, down: 3 }[dir];
  for (let i = 0; i < rotations; i++) work = rotate(work);
  let gained = 0;
  let moved = false;
  for (let r = 0; r < SIZE; r++) {
    const before = work[r].join(",");
    const { row, gained: g } = compress(work[r]);
    work[r] = row;
    gained += g;
    if (row.join(",") !== before) moved = true;
  }
  for (let i = 0; i < (4 - rotations) % 4; i++) work = rotate(work);
  return { board: work, moved, gained };
}

function gameOver(b: Board): boolean {
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      if (b[r][c] === 0) return false;
      if (c + 1 < SIZE && b[r][c] === b[r][c + 1]) return false;
      if (r + 1 < SIZE && b[r][c] === b[r + 1][c]) return false;
    }
  return true;
}

function startBoard(): Board {
  return addRandom(addRandom(emptyBoard()));
}

export default function Game2048() {
  const [board, setBoard] = useState<Board>(startBoard);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState(false);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const submitStatus = useSubmitScoreOnGameOver("2048", score, over);

  useEffect(() => {
    const stored = Number(localStorage.getItem("nexplay:2048-best") || 0);
    setBest(stored);
  }, []);

  useEffect(() => {
    if (score > best) {
      setBest(score);
      localStorage.setItem("nexplay:2048-best", String(score));
    }
  }, [score, best]);

  const tryMove = useCallback(
    (dir: Dir) => {
      if (over || paused || !started) return;
      const { board: nb, moved, gained } = move(board, dir);
      if (!moved) return;
      const next = addRandom(nb);
      setBoard(next);
      setScore((s) => s + gained);
      if (gameOver(next)) setOver(true);
    },
    [board, over, paused, started],
  );

  const start = useCallback(() => {
    setBoard(startBoard());
    setScore(0);
    setOver(false);
    setStarted(true);
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
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "up",
        ArrowDown: "down",
        a: "left",
        d: "right",
        w: "up",
        s: "down",
      };
      const dir = map[e.key];
      if (dir) {
        e.preventDefault();
        tryMove(dir);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tryMove, togglePause]);

  const reset = () => {
    setBoard(startBoard());
    setScore(0);
    setOver(false);
    setStarted(false);
    setPaused(false);
  };

  return (
    <div
      className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#2a1810] to-[#3a1a14] p-2 sm:p-3 select-none"
      onTouchStart={(e) => {
        const t = e.touches[0];
        touchStart.current = { x: t.clientX, y: t.clientY };
      }}
      onTouchEnd={(e) => {
        const start = touchStart.current;
        if (!start) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        if (Math.abs(dx) < 30 && Math.abs(dy) < 30) return;
        if (Math.abs(dx) > Math.abs(dy)) tryMove(dx > 0 ? "right" : "left");
        else tryMove(dy > 0 ? "down" : "up");
        touchStart.current = null;
      }}
    >
      <div className="shrink-0 flex items-center justify-center gap-3 mb-2 flex-wrap">
        <div className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-center min-w-[70px]">
          <div className="text-[10px] uppercase opacity-60">Score</div>
          <div className="font-black">{score}</div>
        </div>
        <div className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-center min-w-[70px]">
          <div className="text-[10px] uppercase opacity-60">Best</div>
          <div className="font-black">{best}</div>
        </div>
        {started && !over && (
          <PauseToggle paused={paused} onClick={togglePause} />
        )}
        <button
          onClick={reset}
          className="px-4 py-2 rounded-lg bg-white text-black text-xs font-bold hover:scale-105 transition-transform"
        >
          New game
        </button>
      </div>

      <div className="flex-1 min-h-0 w-full flex items-center justify-center">
        <div
          className="grid gap-2 p-2 rounded-xl bg-black/40 h-full max-w-full"
          style={{
            gridTemplateColumns: `repeat(${SIZE}, 1fr)`,
            gridTemplateRows: `repeat(${SIZE}, 1fr)`,
            aspectRatio: "1",
          }}
        >
          {board.flatMap((row, r) =>
            row.map((v, c) => (
              <div
                key={`${r}-${c}`}
                className="rounded-lg flex items-center justify-center font-black text-white transition-all"
                style={{
                  background: COLORS[v] ?? "#1c2230",
                  fontSize: v >= 1024 ? "1.1rem" : v >= 128 ? "1.6rem" : "2rem",
                }}
              >
                {v > 0 && v}
              </div>
            )),
          )}
        </div>
      </div>

      <div className="shrink-0 mt-2 text-white/70 text-[11px] text-center">
        Arrow keys / WASD · Swipe on mobile · P pauses
      </div>

      {!started && !over && (
        <GameOverlay
          icon="🎲"
          title="2048"
          subtitle="Slide tiles, combine matching numbers, reach 2048."
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
          icon="🛑"
          title="Game over"
          subtitle={`Final score: ${score}`}
          primary={{ label: "Play again", onClick: start }}
        >
          <ScoreStatus gameSlug="2048" status={submitStatus} />
        </GameOverlay>
      )}
    </div>
  );
}
