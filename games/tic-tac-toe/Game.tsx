"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SoundToggle } from "@/components/SoundToggle";
import { Sfx } from "@/lib/sound";

type Cell = "X" | "O" | null;
type Difficulty = "easy" | "medium" | "hard";

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

/** Pick a random empty cell. */
function randomMove(board: Cell[]): number {
  const empty = board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  return empty[Math.floor(Math.random() * empty.length)];
}

/** Win-or-block heuristic — competent but beatable opening play. */
function heuristicMove(board: Cell[]): number {
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
  // Take center, then corners, then anywhere
  if (empty.includes(4)) return 4;
  for (const c of [0, 2, 6, 8]) if (empty.includes(c)) return c;
  return empty[Math.floor(Math.random() * empty.length)];
}

/** Minimax with alpha-beta. AI is "O" (maximizer), player is "X". */
function minimax(
  board: Cell[],
  player: "X" | "O",
  depth: number,
  alpha: number,
  beta: number,
): number {
  const { winner } = checkWinner(board);
  if (winner === "O") return 10 - depth;
  if (winner === "X") return depth - 10;
  if (board.every((c) => c !== null)) return 0;

  if (player === "O") {
    let best = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i]) continue;
      board[i] = "O";
      const v = minimax(board, "X", depth + 1, alpha, beta);
      board[i] = null;
      best = Math.max(best, v);
      alpha = Math.max(alpha, v);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i]) continue;
      board[i] = "X";
      const v = minimax(board, "O", depth + 1, alpha, beta);
      board[i] = null;
      best = Math.min(best, v);
      beta = Math.min(beta, v);
      if (beta <= alpha) break;
    }
    return best;
  }
}

/** Optimal move via minimax — never loses. */
function bestMove(board: Cell[]): number {
  const work = [...board];
  let best = -Infinity;
  let move = -1;
  for (let i = 0; i < 9; i++) {
    if (work[i]) continue;
    work[i] = "O";
    const v = minimax(work, "X", 0, -Infinity, Infinity);
    work[i] = null;
    if (v > best) {
      best = v;
      move = i;
    }
  }
  return move;
}

function aiMove(board: Cell[], difficulty: Difficulty): number {
  if (difficulty === "easy") {
    // Easy: 80% random, 20% heuristic. Often misses obvious blocks.
    if (Math.random() < 0.8) return randomMove(board);
    return heuristicMove(board);
  }
  if (difficulty === "medium") {
    // Medium: heuristic with a 15% chance of a random move. Beatable
    // by careful play, but blocks most threats.
    if (Math.random() < 0.15) return randomMove(board);
    return heuristicMove(board);
  }
  // Hard: minimax — perfect play. Best you can do is force a draw.
  return bestMove(board);
}

export default function TicTacToe() {
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null));
  const [turn, setTurn] = useState<"X" | "O">("X");
  const [score, setScore] = useState({ x: 0, o: 0, draws: 0 });
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");

  const { winner, line } = checkWinner(board);
  const full = board.every(Boolean);
  const over = winner || full;

  useEffect(() => {
    if (over) {
      if (winner === "X") {
        setScore((s) => ({ ...s, x: s.x + 1 }));
        Sfx.win();
      } else if (winner === "O") {
        setScore((s) => ({ ...s, o: s.o + 1 }));
        Sfx.gameOver();
      } else {
        setScore((s) => ({ ...s, draws: s.draws + 1 }));
        Sfx.click();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over, winner]);

  useEffect(() => {
    if (turn === "O" && !over) {
      const t = setTimeout(() => {
        const idx = aiMove(board, difficulty);
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
  }, [turn, board, over, difficulty]);

  const click = (i: number) => {
    if (board[i] || over || turn !== "X") return;
    const next = [...board];
    next[i] = "X";
    setBoard(next);
    setTurn("O");
    Sfx.place();
  };

  const reset = () => {
    setBoard(Array(9).fill(null));
    setTurn("X");
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#1a1325] to-[#2a1240] p-2 sm:p-3">
      <div className="shrink-0 flex items-center justify-center gap-3 sm:gap-6 mb-2 text-white text-xs sm:text-sm font-medium flex-wrap">
        <SoundToggle />
        <div className={`px-3 py-1 rounded-lg ${turn === "X" && !over ? "bg-[var(--accent)]" : "bg-white/10"}`}>
          You (X) — {score.x}
        </div>
        <div className="text-white/60">Draws: {score.draws}</div>
        <div className={`px-3 py-1 rounded-lg ${turn === "O" && !over ? "bg-[var(--accent-2)]" : "bg-white/10"}`}>
          AI (O) — {score.o}
        </div>
      </div>

      <div className="shrink-0 flex items-center justify-center mb-2">
        <div className="inline-flex rounded-lg bg-white/5 p-0.5 text-[11px]">
          {(["easy", "medium", "hard"] as const).map((d) => (
            <button
              key={d}
              onClick={() => {
                setDifficulty(d);
                setBoard(Array(9).fill(null));
                setTurn("X");
              }}
              className={`px-3 py-1 rounded-md font-bold capitalize transition-colors ${
                difficulty === d
                  ? "bg-white/15 text-white"
                  : "text-white/60 hover:text-white"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 w-full flex items-center justify-center">
      <div className="grid grid-cols-3 grid-rows-3 gap-2 h-full max-w-full aspect-square">
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
      </div>

      <div className="shrink-0 mt-2 h-6 text-white text-xs sm:text-sm text-center">
        {winner === "X" && <span>🎉 You win!</span>}
        {winner === "O" && <span>🤖 AI wins.</span>}
        {!winner && full && <span>It&apos;s a draw.</span>}
      </div>

      <div className="shrink-0 mt-1 flex gap-2 justify-center">
        <button
          onClick={reset}
          className="px-4 py-1.5 rounded-lg bg-white text-black text-xs sm:text-sm font-bold hover:scale-105 transition-transform"
        >
          New round
        </button>
        <Link
          href="/multiplayer/tic-tac-toe"
          className="px-4 py-1.5 rounded-lg bg-white/10 text-white text-xs sm:text-sm font-bold hover:bg-white/20 transition-colors"
        >
          Play with a friend →
        </Link>
      </div>
    </div>
  );
}
