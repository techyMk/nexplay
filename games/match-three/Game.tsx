"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";

const SIZE = 8;
const MOVES = 25;
const GEMS = ["💎", "🔮", "💚", "❤️", "💛", "🧡"];

type Board = number[][]; // 0..GEMS.length-1, or -1 for empty

function rand() {
  return Math.floor(Math.random() * GEMS.length);
}

function makeBoardNoMatches(): Board {
  while (true) {
    const b: Board = Array.from({ length: SIZE }, () =>
      Array.from({ length: SIZE }, () => rand()),
    );
    if (findMatches(b).length === 0) return b;
  }
}

function findMatches(b: Board): [number, number][] {
  const out: [number, number][] = [];
  // horizontal
  for (let r = 0; r < SIZE; r++) {
    let run = 1;
    for (let c = 1; c <= SIZE; c++) {
      if (c < SIZE && b[r][c] === b[r][c - 1] && b[r][c] !== -1) run++;
      else {
        if (run >= 3) for (let k = c - run; k < c; k++) out.push([r, k]);
        run = 1;
      }
    }
  }
  // vertical
  for (let c = 0; c < SIZE; c++) {
    let run = 1;
    for (let r = 1; r <= SIZE; r++) {
      if (r < SIZE && b[r][c] === b[r - 1][c] && b[r][c] !== -1) run++;
      else {
        if (run >= 3) for (let k = r - run; k < r; k++) out.push([k, c]);
        run = 1;
      }
    }
  }
  return out;
}

function gravityAndRefill(b: Board): Board {
  const next = b.map((row) => [...row]);
  for (let c = 0; c < SIZE; c++) {
    let write = SIZE - 1;
    for (let r = SIZE - 1; r >= 0; r--) {
      if (next[r][c] !== -1) {
        next[write][c] = next[r][c];
        if (write !== r) next[r][c] = -1;
        write--;
      }
    }
    for (let r = write; r >= 0; r--) next[r][c] = rand();
  }
  return next;
}

export default function MatchThree() {
  const [board, setBoard] = useState<Board>(() => makeBoardNoMatches());
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(MOVES);
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [busy, setBusy] = useState(false);
  const overRef = useRef(false);
  const over = moves <= 0 && !busy;
  const submitStatus = useSubmitScoreOnGameOver("match-three", score, over);

  const cascade = useCallback((b0: Board): Promise<Board> => {
    return new Promise((resolve) => {
      let b = b0;
      let combo = 0;
      const step = () => {
        const matches = findMatches(b);
        if (matches.length === 0) {
          resolve(b);
          return;
        }
        combo++;
        const cleared = b.map((row) => [...row]);
        for (const [r, c] of matches) cleared[r][c] = -1;
        const earned = matches.length * 10 * combo;
        setScore((s) => s + earned);
        setBoard(cleared);
        setTimeout(() => {
          b = gravityAndRefill(cleared);
          setBoard(b);
          setTimeout(step, 200);
        }, 220);
      };
      setTimeout(step, 50);
    });
  }, []);

  const swap = async (a: [number, number], b: [number, number]) => {
    if (busy) return;
    if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) !== 1) return;
    setBusy(true);
    const next = board.map((row) => [...row]);
    [next[a[0]][a[1]], next[b[0]][b[1]]] = [next[b[0]][b[1]], next[a[0]][a[1]]];
    setBoard(next);
    if (findMatches(next).length === 0) {
      // illegal; swap back
      setTimeout(() => {
        setBoard((b2) => {
          const r = b2.map((row) => [...row]);
          [r[a[0]][a[1]], r[b[0]][b[1]]] = [r[b[0]][b[1]], r[a[0]][a[1]]];
          return r;
        });
        setBusy(false);
      }, 250);
      return;
    }
    setMoves((m) => m - 1);
    const settled = await cascade(next);
    setBoard(settled);
    setBusy(false);
  };

  const click = (r: number, c: number) => {
    if (busy || over) return;
    if (!sel) {
      setSel([r, c]);
      return;
    }
    if (sel[0] === r && sel[1] === c) {
      setSel(null);
      return;
    }
    swap(sel, [r, c]);
    setSel(null);
  };

  const reset = () => {
    setBoard(makeBoardNoMatches());
    setScore(0);
    setMoves(MOVES);
    setSel(null);
    setBusy(false);
    overRef.current = false;
  };

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#1a0a2a] to-[#0b0d12] p-4 select-none">
      <div className="flex items-center gap-3 mb-3 text-white text-sm">
        <span className="px-3 py-1 rounded-lg bg-white/10">💎 {score}</span>
        <span className="px-3 py-1 rounded-lg bg-white/10">🔄 {moves}</span>
      </div>

      <div
        className="grid gap-1.5 p-2 rounded-2xl bg-black/40 border border-white/10"
        style={{
          gridTemplateColumns: `repeat(${SIZE}, 1fr)`,
          gridTemplateRows: `repeat(${SIZE}, 1fr)`,
          width: "min(80vh, 480px)",
          aspectRatio: "1",
        }}
      >
        {board.map((row, r) =>
          row.map((g, c) => {
            const isSel = sel && sel[0] === r && sel[1] === c;
            return (
              <button
                key={`${r}-${c}`}
                onClick={() => click(r, c)}
                className={`relative rounded-lg flex items-center justify-center text-2xl sm:text-3xl transition-all ${
                  g === -1
                    ? "bg-transparent"
                    : isSel
                      ? "bg-[var(--accent)] scale-110 z-10"
                      : "bg-white/5 hover:bg-white/10"
                }`}
              >
                {g >= 0 ? GEMS[g] : ""}
              </button>
            );
          }),
        )}
      </div>

      <div className="mt-2 text-[10px] text-white/50">
        Click two adjacent gems to swap. Match 3+ in a row.
      </div>

      {over && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-2">
          <div className="text-5xl">🏆</div>
          <div className="text-3xl font-black text-white">Round complete!</div>
          <div className="text-white/80">Score: {score}</div>
          <ScoreStatus gameSlug="match-three" status={submitStatus} />
          <button onClick={reset} className="mt-2 px-6 py-3 rounded-lg bg-white text-black font-bold hover:scale-105 transition-transform">
            Play again
          </button>
        </div>
      )}
    </div>
  );
}
