"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Cell = "X" | "O" | null;

const LINES: [number, number, number][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function checkWinner(board: Cell[]): { winner: Cell; line: number[] | null } {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line: [...line] };
    }
  }
  return { winner: null, line: null };
}

function aiMove(board: Cell[]): number {
  const empty = board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  // Try to win
  for (const i of empty) {
    const test = [...board];
    test[i] = "O";
    if (checkWinner(test).winner === "O") return i;
  }
  // Block player
  for (const i of empty) {
    const test = [...board];
    test[i] = "X";
    if (checkWinner(test).winner === "X") return i;
  }
  // Take center
  if (empty.includes(4)) return 4;
  // Take a corner
  for (const c of [0, 2, 6, 8]) if (empty.includes(c)) return c;
  // Take any
  return empty[Math.floor(Math.random() * empty.length)];
}

export default function TicTacToe() {
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null));
  const [turn, setTurn] = useState<"X" | "O">("X");
  const [score, setScore] = useState({ x: 0, o: 0, draws: 0 });

  const { winner, line } = checkWinner(board);
  const full = board.every(Boolean);
  const over = winner || full;

  useEffect(() => {
    if (over) {
      if (winner === "X") setScore((s) => ({ ...s, x: s.x + 1 }));
      else if (winner === "O") setScore((s) => ({ ...s, o: s.o + 1 }));
      else setScore((s) => ({ ...s, draws: s.draws + 1 }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over, winner]);

  useEffect(() => {
    if (turn === "O" && !over) {
      const t = setTimeout(() => {
        const idx = aiMove(board);
        setBoard((b) => {
          if (b[idx]) return b;
          const next = [...b];
          next[idx] = "O";
          return next;
        });
        setTurn("X");
      }, 450);
      return () => clearTimeout(t);
    }
  }, [turn, board, over]);

  const click = (i: number) => {
    if (board[i] || over || turn !== "X") return;
    const next = [...board];
    next[i] = "X";
    setBoard(next);
    setTurn("O");
  };

  const reset = () => {
    setBoard(Array(9).fill(null));
    setTurn("X");
  };

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#1a1325] to-[#2a1240] p-4">
      <div className="flex items-center gap-6 mb-4 text-white text-sm font-medium">
        <div className={`px-3 py-1 rounded-lg ${turn === "X" && !over ? "bg-[var(--accent)]" : "bg-white/10"}`}>
          You (X) — {score.x}
        </div>
        <div className="text-white/60">Draws: {score.draws}</div>
        <div className={`px-3 py-1 rounded-lg ${turn === "O" && !over ? "bg-[var(--accent-2)]" : "bg-white/10"}`}>
          AI (O) — {score.o}
        </div>
      </div>

      <div className="grid grid-cols-3 grid-rows-3 gap-2 w-full max-w-[min(60vh,360px)] aspect-square">
        {board.map((cell, i) => {
          const win = line?.includes(i);
          return (
            <button
              key={i}
              onClick={() => click(i)}
              className={`rounded-xl border-2 text-5xl md:text-6xl font-black flex items-center justify-center transition-all ${
                win
                  ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                  : "bg-white/5 border-white/10 hover:border-white/30 text-white"
              }`}
              aria-label={`Cell ${i + 1}`}
            >
              {cell === "X" && <span className="text-[var(--accent)]">×</span>}
              {cell === "O" && <span className="text-[var(--accent-2)]">○</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-4 h-8 text-white text-sm">
        {winner === "X" && <span>🎉 You win!</span>}
        {winner === "O" && <span>🤖 AI wins.</span>}
        {!winner && full && <span>It&apos;s a draw.</span>}
      </div>

      <div className="mt-2 flex gap-2">
        <button
          onClick={reset}
          className="px-5 py-2 rounded-lg bg-white text-black text-sm font-bold hover:scale-105 transition-transform"
        >
          New round
        </button>
        <Link
          href="/multiplayer/tic-tac-toe"
          className="px-5 py-2 rounded-lg bg-white/10 text-white text-sm font-bold hover:bg-white/20 transition-colors"
        >
          Play with a friend →
        </Link>
      </div>
    </div>
  );
}
