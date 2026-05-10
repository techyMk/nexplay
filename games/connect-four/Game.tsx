"use client";

import { useEffect, useState } from "react";

const ROWS = 6;
const COLS = 7;

type Cell = 0 | 1 | 2; // 0 empty, 1 player, 2 ai
type Difficulty = "easy" | "medium" | "hard";

function emptyBoard(): Cell[][] {
  return Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(0));
}

function drop(board: Cell[][], col: number, who: Cell): Cell[][] | null {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r][col] === 0) {
      const next = board.map((row) => [...row]);
      next[r][col] = who;
      return next;
    }
  }
  return null;
}

function checkWin(board: Cell[][], who: Cell): [number, number][] | null {
  const dirs: [number, number][] = [
    [0, 1], [1, 0], [1, 1], [1, -1],
  ];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] !== who) continue;
      for (const [dr, dc] of dirs) {
        const cells: [number, number][] = [];
        for (let k = 0; k < 4; k++) {
          const nr = r + dr * k;
          const nc = c + dc * k;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
          if (board[nr][nc] !== who) break;
          cells.push([nr, nc]);
        }
        if (cells.length === 4) return cells;
      }
    }
  }
  return null;
}

function legalCols(board: Cell[][]): number[] {
  return Array.from({ length: COLS }, (_, i) => i).filter(
    (c) => board[0][c] === 0,
  );
}

/** Random legal column. */
function randomCol(board: Cell[][]): number {
  const cols = legalCols(board);
  return cols[Math.floor(Math.random() * cols.length)];
}

/** Win-or-block heuristic. */
function heuristicCol(board: Cell[][]): number {
  const cols = legalCols(board);
  for (const c of cols) {
    const test = drop(board, c, 2);
    if (test && checkWin(test, 2)) return c;
  }
  for (const c of cols) {
    const test = drop(board, c, 1);
    if (test && checkWin(test, 1)) return c;
  }
  if (cols.includes(3)) return 3;
  return cols[Math.floor(Math.random() * cols.length)];
}

/** Lightweight position score: count own 2-in-a-rows minus opponent's,
 *  weighted by center bias. Used at minimax leaves. */
function scoreBoard(board: Cell[][]): number {
  const dirs: [number, number][] = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  let s = 0;
  // Center column bias
  for (let r = 0; r < ROWS; r++) {
    if (board[r][3] === 2) s += 3;
    else if (board[r][3] === 1) s -= 3;
  }
  // Window scoring: every 4-in-a-row window contributes by composition
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (const [dr, dc] of dirs) {
        const nr = r + dr * 3;
        const nc = c + dc * 3;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
        let me = 0,
          you = 0;
        for (let k = 0; k < 4; k++) {
          const v = board[r + dr * k][c + dc * k];
          if (v === 2) me++;
          else if (v === 1) you++;
        }
        if (me && you) continue; // mixed window has no value
        if (me === 4) s += 100;
        else if (me === 3) s += 8;
        else if (me === 2) s += 2;
        else if (you === 4) s -= 100;
        else if (you === 3) s -= 9; // weight blocking slightly higher
        else if (you === 2) s -= 2;
      }
    }
  }
  return s;
}

/** Negamax with alpha-beta. who is the side to move (1 player, 2 AI).
 *  Returns score from the AI's POV (positive = good for AI). */
function negamax(
  board: Cell[][],
  who: 1 | 2,
  depth: number,
  alpha: number,
  beta: number,
): number {
  // Terminal checks
  const wAi = checkWin(board, 2);
  if (wAi) return 100000 + depth;
  const wHum = checkWin(board, 1);
  if (wHum) return -100000 - depth;
  const cols = legalCols(board);
  if (cols.length === 0 || depth === 0) return scoreBoard(board);

  // Order columns center-out for better pruning
  cols.sort((a, b) => Math.abs(a - 3) - Math.abs(b - 3));

  if (who === 2) {
    let best = -Infinity;
    for (const c of cols) {
      const next = drop(board, c, 2);
      if (!next) continue;
      const v = negamax(next, 1, depth - 1, alpha, beta);
      best = Math.max(best, v);
      alpha = Math.max(alpha, v);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const c of cols) {
      const next = drop(board, c, 1);
      if (!next) continue;
      const v = negamax(next, 2, depth - 1, alpha, beta);
      best = Math.min(best, v);
      beta = Math.min(beta, v);
      if (beta <= alpha) break;
    }
    return best;
  }
}

/** Best column via depth-limited search. Depth 5 plays well without
 *  blocking the UI on a 7-wide board. */
function bestCol(board: Cell[][], depth: number): number {
  const cols = legalCols(board);
  cols.sort((a, b) => Math.abs(a - 3) - Math.abs(b - 3));
  let best = -Infinity;
  let pick = cols[0];
  for (const c of cols) {
    const next = drop(board, c, 2);
    if (!next) continue;
    const v = negamax(next, 1, depth - 1, -Infinity, Infinity);
    if (v > best) {
      best = v;
      pick = c;
    }
  }
  return pick;
}

function aiMove(board: Cell[][], difficulty: Difficulty): number {
  if (difficulty === "easy") {
    // Easy: 75% pure random, 25% heuristic. Often misses 3-in-a-rows.
    if (Math.random() < 0.75) return randomCol(board);
    return heuristicCol(board);
  }
  if (difficulty === "medium") {
    // Medium: heuristic with shallow lookahead (2 ply). Solid but
    // beatable through traps and double threats.
    if (Math.random() < 0.1) return randomCol(board);
    return bestCol(board, 2);
  }
  // Hard: deep search. Plays trap setups and rarely loses.
  return bestCol(board, 5);
}

export default function ConnectFour() {
  const [board, setBoard] = useState<Cell[][]>(emptyBoard);
  const [turn, setTurn] = useState<1 | 2>(1);
  const [winLine, setWinLine] = useState<[number, number][] | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");

  const full = board[0].every((c) => c !== 0);
  const over = winLine || full;

  useEffect(() => {
    if (turn === 2 && !over) {
      const t = setTimeout(() => {
        const c = aiMove(board, difficulty);
        const next = drop(board, c, 2);
        if (next) {
          setBoard(next);
          const w = checkWin(next, 2);
          if (w) setWinLine(w);
          else setTurn(1);
        }
      }, 500);
      return () => clearTimeout(t);
    }
  }, [turn, board, over, difficulty]);

  const drop1 = (col: number) => {
    if (over || turn !== 1) return;
    const next = drop(board, col, 1);
    if (!next) return;
    setBoard(next);
    const w = checkWin(next, 1);
    if (w) setWinLine(w);
    else setTurn(2);
  };

  const reset = () => {
    setBoard(emptyBoard());
    setTurn(1);
    setWinLine(null);
  };

  const isWinCell = (r: number, c: number) =>
    winLine?.some(([wr, wc]) => wr === r && wc === c);

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#3a0e0e] to-[#1a1325] p-2 sm:p-3">
      <div className="shrink-0 flex items-center justify-center gap-4 mb-2 text-white text-xs sm:text-sm">
        <span className={turn === 1 && !over ? "font-bold" : "opacity-60"}>
          🔴 You
        </span>
        <span className="opacity-40">vs</span>
        <span className={turn === 2 && !over ? "font-bold" : "opacity-60"}>
          🟡 AI
        </span>
      </div>

      <div className="shrink-0 flex items-center justify-center mb-2">
        <div className="inline-flex rounded-lg bg-white/10 p-0.5 text-[11px]">
          {(["easy", "medium", "hard"] as const).map((d) => (
            <button
              key={d}
              onClick={() => {
                setDifficulty(d);
                setBoard(emptyBoard());
                setTurn(1);
                setWinLine(null);
              }}
              className={`px-3 py-1 rounded-md font-bold capitalize transition-colors ${
                difficulty === d
                  ? "bg-white/20 text-white"
                  : "text-white/60 hover:text-white"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 w-full flex items-center justify-center">
      <div
        className="rounded-2xl p-2 sm:p-3 bg-blue-700/80 h-full max-w-full"
        style={{ aspectRatio: "7 / 7" }}
      >
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2 h-full">
          {Array.from({ length: COLS }).map((_, c) => (
            <button
              key={`btn-${c}`}
              onClick={() => drop1(c)}
              disabled={!!over || turn !== 1 || board[0][c] !== 0}
              className="aspect-square rounded-full bg-black/30 hover:bg-white/20 disabled:opacity-40 transition-colors flex items-center justify-center text-white text-xl"
              aria-label={`Drop in column ${c + 1}`}
            >
              ↓
            </button>
          ))}
          {board.flatMap((row, r) =>
            row.map((v, c) => (
              <div
                key={`${r}-${c}`}
                className={`aspect-square rounded-full flex items-center justify-center transition-all ${
                  isWinCell(r, c) ? "ring-4 ring-white" : ""
                }`}
                style={{
                  background:
                    v === 1
                      ? "radial-gradient(circle at 30% 30%, #ff6666, #b91c1c)"
                      : v === 2
                        ? "radial-gradient(circle at 30% 30%, #ffe066, #ca8a04)"
                        : "rgba(0,0,0,0.5)",
                }}
              />
            )),
          )}
        </div>
      </div>
      </div>

      <div className="shrink-0 mt-2 h-6 text-white text-xs sm:text-sm text-center">
        {!over && (
          <span className="text-white/70">
            Click an arrow above a column to drop your red disc. Connect four
            in a row to win.
          </span>
        )}
        {winLine && turn === 1 && (
          <span className="font-bold">🎉 You connected four!</span>
        )}
        {winLine && turn === 2 && (
          <span className="font-bold">🤖 AI got four in a row.</span>
        )}
        {!winLine && full && <span className="font-bold">Board full — draw!</span>}
      </div>

      {over && (
        <button
          onClick={reset}
          className="shrink-0 mt-1 mx-auto px-5 py-2 rounded-lg bg-white text-black text-xs sm:text-sm font-bold hover:scale-105 transition-transform"
        >
          New game
        </button>
      )}
    </div>
  );
}
