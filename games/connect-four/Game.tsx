"use client";

import { useEffect, useState } from "react";

const ROWS = 6;
const COLS = 7;

type Cell = 0 | 1 | 2; // 0 empty, 1 player, 2 ai

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

function aiMove(board: Cell[][]): number {
  const cols = Array.from({ length: COLS }, (_, i) => i).filter((c) =>
    board[0][c] === 0,
  );
  // Win if possible
  for (const c of cols) {
    const test = drop(board, c, 2);
    if (test && checkWin(test, 2)) return c;
  }
  // Block player win
  for (const c of cols) {
    const test = drop(board, c, 1);
    if (test && checkWin(test, 1)) return c;
  }
  // Prefer center
  if (cols.includes(3)) return 3;
  return cols[Math.floor(Math.random() * cols.length)];
}

export default function ConnectFour() {
  const [board, setBoard] = useState<Cell[][]>(emptyBoard);
  const [turn, setTurn] = useState<1 | 2>(1);
  const [winLine, setWinLine] = useState<[number, number][] | null>(null);

  const full = board[0].every((c) => c !== 0);
  const over = winLine || full;

  useEffect(() => {
    if (turn === 2 && !over) {
      const t = setTimeout(() => {
        const c = aiMove(board);
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
  }, [turn, board, over]);

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
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#3a0e0e] to-[#1a1325] p-4">
      <div className="flex items-center gap-4 mb-3 text-white text-sm">
        <span className={turn === 1 && !over ? "font-bold" : "opacity-60"}>
          🔴 You
        </span>
        <span className="opacity-40">vs</span>
        <span className={turn === 2 && !over ? "font-bold" : "opacity-60"}>
          🟡 AI
        </span>
      </div>

      <div
        className="rounded-2xl p-3 bg-blue-700/80"
        style={{ width: "min(70vh, 520px)" }}
      >
        <div className="grid grid-cols-7 gap-2">
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

      <div className="mt-3 h-7 text-white text-sm">
        {winLine && turn === 1 && <span>🎉 You connected four!</span>}
        {winLine && turn === 2 && <span>🤖 AI got four in a row.</span>}
        {!winLine && full && <span>Board full — draw!</span>}
      </div>

      <button
        onClick={reset}
        className="mt-2 px-5 py-2 rounded-lg bg-white text-black text-sm font-bold hover:scale-105 transition-transform"
      >
        New game
      </button>
    </div>
  );
}
