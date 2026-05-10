"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";
import { GameOverlay } from "@/components/games/GameOverlay";
import { SoundToggle } from "@/components/SoundToggle";
import { Sfx } from "@/lib/sound";

const COLS = 10;
const ROWS = 20;
const CELL = 28;
const W = COLS * CELL;
const H = ROWS * CELL;

type Cell = number; // 0 empty, 1..7 piece colors
type Board = Cell[][];

const COLORS = ["#0b0d12", "#06b6d4", "#facc15", "#a855f7", "#16a34a", "#ef4444", "#3b82f6", "#f97316"];

// I, O, T, S, Z, J, L (1-indexed by COLOR)
const PIECES: number[][][][] = [
  [[[1,1,1,1]],
   [[1],[1],[1],[1]]],
  [[[2,2],[2,2]]],
  [[[0,3,0],[3,3,3]],
   [[3,0],[3,3],[3,0]],
   [[3,3,3],[0,3,0]],
   [[0,3],[3,3],[0,3]]],
  [[[0,4,4],[4,4,0]],
   [[4,0],[4,4],[0,4]]],
  [[[5,5,0],[0,5,5]],
   [[0,5],[5,5],[5,0]]],
  [[[6,0,0],[6,6,6]],
   [[6,6],[6,0],[6,0]],
   [[6,6,6],[0,0,6]],
   [[0,6],[0,6],[6,6]]],
  [[[0,0,7],[7,7,7]],
   [[7,0],[7,0],[7,7]],
   [[7,7,7],[7,0,0]],
   [[7,7],[0,7],[0,7]]],
];

function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function randomPiece() {
  const idx = Math.floor(Math.random() * PIECES.length);
  return { idx, rot: 0, x: 3, y: 0 };
}

function shape(p: { idx: number; rot: number }): number[][] {
  const variants = PIECES[p.idx];
  return variants[p.rot % variants.length];
}

function collides(board: Board, p: { idx: number; rot: number; x: number; y: number }): boolean {
  const s = shape(p);
  for (let r = 0; r < s.length; r++) {
    for (let c = 0; c < s[r].length; c++) {
      if (!s[r][c]) continue;
      const x = p.x + c, y = p.y + r;
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y < 0) continue;
      if (board[y][x]) return true;
    }
  }
  return false;
}

function merge(board: Board, p: { idx: number; rot: number; x: number; y: number }): Board {
  const s = shape(p);
  const next = board.map((row) => [...row]);
  for (let r = 0; r < s.length; r++)
    for (let c = 0; c < s[r].length; c++)
      if (s[r][c]) {
        const x = p.x + c, y = p.y + r;
        if (y >= 0) next[y][x] = s[r][c];
      }
  return next;
}

function clearLines(board: Board): { board: Board; cleared: number } {
  const remaining = board.filter((row) => row.some((v) => !v));
  const cleared = ROWS - remaining.length;
  while (remaining.length < ROWS) remaining.unshift(Array(COLS).fill(0));
  return { board: remaining, cleared };
}

export default function Tetris() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [lines, setLines] = useState(0);
  const [level, setLevel] = useState(1);
  const [over, setOver] = useState(false);
  const [paused, setPaused] = useState(false);
  const [started, setStarted] = useState(false);
  const submitStatus = useSubmitScoreOnGameOver("tetris", score, over);

  const stateRef = useRef({
    board: emptyBoard() as Board,
    piece: randomPiece(),
    next: randomPiece(),
    drop: 0,
  });

  useEffect(() => setBest(Number(localStorage.getItem("nexplay:tetris-best") || 0)), []);

  const reset = useCallback(() => {
    stateRef.current = { board: emptyBoard(), piece: randomPiece(), next: randomPiece(), drop: 0 };
    setScore(0); setLines(0); setLevel(1); setOver(false); setPaused(false); setStarted(false);
  }, []);

  const start = useCallback(() => {
    setStarted(true);
    setPaused(false);
  }, []);

  const togglePause = useCallback(() => {
    if (over || !started) return;
    setPaused((p) => !p);
  }, [over, started]);

  const tryMove = useCallback((dx: number, dy: number, dr = 0) => {
    const st = stateRef.current;
    const test = { ...st.piece, x: st.piece.x + dx, y: st.piece.y + dy, rot: st.piece.rot + dr };
    if (!collides(st.board, test)) {
      st.piece = test;
      return true;
    }
    return false;
  }, []);

  const lockAndSpawn = useCallback(() => {
    const st = stateRef.current;
    st.board = merge(st.board, st.piece);
    Sfx.thud();
    const { board: nb, cleared } = clearLines(st.board);
    st.board = nb;
    if (cleared) {
      if (cleared >= 4) Sfx.bigMatch();
      else Sfx.match();
      setLines((l) => {
        const total = l + cleared;
        setLevel(Math.floor(total / 10) + 1);
        return total;
      });
      const points = [0, 40, 100, 300, 1200][cleared] * (level || 1);
      setScore((s) => {
        const n = s + points;
        setBest((b) => {
          const nb2 = Math.max(b, n);
          localStorage.setItem("nexplay:tetris-best", String(nb2));
          return nb2;
        });
        return n;
      });
    }
    st.piece = st.next;
    st.next = randomPiece();
    if (collides(st.board, st.piece)) {
      setOver(true);
      Sfx.gameOver();
    }
  }, [level]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (over) return;
      if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        e.preventDefault();
        togglePause();
        return;
      }
      if (paused) return; // Block gameplay input while paused
      if (e.key === "ArrowLeft" || e.key === "a") { e.preventDefault(); tryMove(-1, 0); }
      else if (e.key === "ArrowRight" || e.key === "d") { e.preventDefault(); tryMove(1, 0); }
      else if (e.key === "ArrowDown" || e.key === "s") { e.preventDefault(); if (!tryMove(0, 1)) lockAndSpawn(); }
      else if (e.key === "ArrowUp" || e.key === "w") { e.preventDefault(); tryMove(0, 0, 1); }
      else if (e.key === " ") {
        e.preventDefault();
        while (tryMove(0, 1)) {}
        lockAndSpawn();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [over, paused, togglePause, tryMove, lockAndSpawn]);

  // Touch input — left/right swipe moves, tap rotates, swipe down soft
  // drops, fast swipe down hard drops.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let startX = 0;
    let startY = 0;
    let startT = 0;
    let lastMoveX = 0;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
      startT = performance.now();
      lastMoveX = startX;
    };
    const onMove = (e: TouchEvent) => {
      if (over || paused) return;
      const t = e.touches[0];
      if (!t) return;
      // Horizontal swipe: move one cell per ~24px traveled since last move.
      const rect = canvas.getBoundingClientRect();
      const cellWidth = rect.width / COLS;
      const dx = t.clientX - lastMoveX;
      if (Math.abs(dx) > cellWidth * 0.7) {
        const steps = Math.trunc(dx / cellWidth);
        for (let i = 0; i < Math.abs(steps); i++) tryMove(Math.sign(steps), 0);
        lastMoveX += steps * cellWidth;
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (over || paused) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const dt = performance.now() - startT;
      // Tap (no significant motion) → rotate
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && dt < 300) {
        tryMove(0, 0, 1);
        return;
      }
      // Mostly-vertical down swipe
      if (dy > 40 && Math.abs(dy) > Math.abs(dx)) {
        // Fast downward flick → hard drop
        if (dy / Math.max(1, dt) > 0.8) {
          while (tryMove(0, 1)) {}
          lockAndSpawn();
        } else {
          if (!tryMove(0, 1)) lockAndSpawn();
        }
      }
    };
    canvas.addEventListener("touchstart", onStart, { passive: true });
    canvas.addEventListener("touchmove", onMove, { passive: true });
    canvas.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      canvas.removeEventListener("touchstart", onStart);
      canvas.removeEventListener("touchmove", onMove);
      canvas.removeEventListener("touchend", onEnd);
    };
  }, [over, paused, tryMove, lockAndSpawn]);

  useEffect(() => {
    if (over || paused || !started) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const st = stateRef.current;
      const dropInterval = Math.max(0.08, 0.8 - (level - 1) * 0.06);
      st.drop += dt;
      while (st.drop >= dropInterval) {
        st.drop -= dropInterval;
        if (!tryMove(0, 1)) lockAndSpawn();
      }
      // draw
      ctx.fillStyle = "#0b0d12";
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      for (let i = 1; i < COLS; i++) { ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, H); ctx.stroke(); }
      for (let i = 1; i < ROWS; i++) { ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(W, i * CELL); ctx.stroke(); }
      const drawCell = (x: number, y: number, color: number) => {
        if (!color) return;
        ctx.fillStyle = COLORS[color];
        ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fillRect(x * CELL + 2, y * CELL + 2, CELL - 4, 4);
      };
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) drawCell(c, r, st.board[r][c]);
      const s = shape(st.piece);
      for (let r = 0; r < s.length; r++) for (let c = 0; c < s[r].length; c++) drawCell(st.piece.x + c, st.piece.y + r, s[r][c]);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [over, paused, started, level, tryMove, lockAndSpawn]);

  return (
    <div className="absolute inset-0 flex items-stretch justify-center bg-gradient-to-br from-[#0a0218] to-[#0b0d12] p-2 sm:p-3 gap-3 sm:gap-4">
      <div className="flex-1 min-w-0 min-h-0 flex items-center justify-center">
        <div className="relative h-full max-w-full" style={{ aspectRatio: `${W} / ${H}` }}>
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="absolute inset-0 w-full h-full block rounded-xl border border-white/10"
          />
          {!started && !over && (
            <GameOverlay
              icon="🟦"
              title="Tetris"
              subtitle="Stack the falling pieces. Clear lines. Don't reach the top."
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
              subtitle={`Score: ${score} • Lines: ${lines}`}
              primary={{ label: "Play again", onClick: reset }}
            >
              <ScoreStatus gameSlug="tetris" status={submitStatus} />
            </GameOverlay>
          )}
        </div>
      </div>
      <div className="text-white text-xs space-y-2 hidden sm:flex sm:flex-col sm:justify-center shrink-0">
        <div className="px-3 py-2 rounded-lg bg-white/5">
          <div className="opacity-60 uppercase tracking-wider">Score</div>
          <div className="text-2xl font-black">{score}</div>
        </div>
        <div className="px-3 py-2 rounded-lg bg-white/5">
          <div className="opacity-60 uppercase tracking-wider">Best</div>
          <div className="text-2xl font-black">{best}</div>
        </div>
        <div className="px-3 py-2 rounded-lg bg-white/5">
          <div className="opacity-60 uppercase tracking-wider">Lines</div>
          <div className="text-xl font-bold">{lines}</div>
        </div>
        <div className="px-3 py-2 rounded-lg bg-white/5">
          <div className="opacity-60 uppercase tracking-wider">Level</div>
          <div className="text-xl font-bold">{level}</div>
        </div>
        <div className="px-3 py-2 rounded-lg bg-white/5 text-[10px] opacity-70 leading-relaxed">
          ←→ move<br />↑ rotate<br />↓ soft drop<br />space hard drop<br />P pause<br />
          <span className="text-white/50">swipe / tap on mobile</span>
        </div>
        <SoundToggle className="self-stretch" />
        {!over && (
          <button
            onClick={togglePause}
            className="px-3 py-2 rounded-lg bg-white text-black text-xs font-bold hover:scale-105 transition-transform"
          >
            {paused ? "▶ Resume" : "⏸ Pause"}
          </button>
        )}
      </div>
    </div>
  );
}
