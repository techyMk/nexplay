"use client";

import { useEffect, useState } from "react";

const COLS = 16;
const ROWS = 16;
const MINES = 40;

type CellState = {
  mine: boolean;
  revealed: boolean;
  flagged: boolean;
  adj: number;
};

function makeBoard(seed?: { row: number; col: number }): CellState[][] {
  const board: CellState[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => ({ mine: false, revealed: false, flagged: false, adj: 0 })),
  );
  let placed = 0;
  while (placed < MINES) {
    const r = Math.floor(Math.random() * ROWS);
    const c = Math.floor(Math.random() * COLS);
    if (board[r][c].mine) continue;
    if (seed && Math.abs(r - seed.row) <= 1 && Math.abs(c - seed.col) <= 1) continue;
    board[r][c].mine = true;
    placed++;
  }
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c].mine) continue;
      let n = 0;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr, cc = c + dc;
          if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && board[rr][cc].mine) n++;
        }
      board[r][c].adj = n;
    }
  }
  return board;
}

function reveal(b: CellState[][], r: number, c: number) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;
  const cell = b[r][c];
  if (cell.revealed || cell.flagged) return;
  cell.revealed = true;
  if (cell.adj === 0 && !cell.mine) {
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++)
        if (dr || dc) reveal(b, r + dr, c + dc);
  }
}

const NUM_COLOR = ["", "#06b6d4", "#16a34a", "#ef4444", "#7c5cff", "#f97316", "#3b82f6", "#a855f7", "#facc15"];

export default function Minesweeper() {
  const [board, setBoard] = useState<CellState[][]>(() => makeBoard());
  const [first, setFirst] = useState(true);
  const [over, setOver] = useState(false);
  const [won, setWon] = useState(false);
  const [time, setTime] = useState(0);
  const flags = board.flat().filter((c) => c.flagged).length;

  useEffect(() => {
    if (over || won || first) return;
    const id = setInterval(() => setTime((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [over, won, first]);

  useEffect(() => {
    if (over || won) return;
    const remaining = board.flat().filter((c) => !c.revealed && !c.mine).length;
    if (remaining === 0) setWon(true);
  }, [board, over, won]);

  const click = (r: number, c: number) => {
    if (over || won) return;
    let b: CellState[][];
    if (first) {
      b = makeBoard({ row: r, col: c });
      setFirst(false);
      setTime(0);
    } else {
      b = board.map((row) => row.map((cell) => ({ ...cell })));
    }
    if (b[r][c].flagged) return;
    if (b[r][c].mine) {
      // reveal all mines
      b.forEach((row) => row.forEach((cell) => { if (cell.mine) cell.revealed = true; }));
      setBoard(b);
      setOver(true);
      return;
    }
    reveal(b, r, c);
    setBoard(b);
  };

  const flag = (e: React.MouseEvent, r: number, c: number) => {
    e.preventDefault();
    if (over || won) return;
    setBoard((b) => {
      const next = b.map((row) => row.map((cell) => ({ ...cell })));
      if (!next[r][c].revealed) next[r][c].flagged = !next[r][c].flagged;
      return next;
    });
  };

  const reset = () => {
    setBoard(makeBoard());
    setFirst(true);
    setOver(false);
    setWon(false);
    setTime(0);
  };

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#0a1a2a] to-[#0b0d12] p-4 select-none">
      <div className="flex items-center gap-3 mb-3 text-white text-sm">
        <span className="px-3 py-1 rounded-lg bg-white/10">💣 {MINES - flags}</span>
        <span className="px-3 py-1 rounded-lg bg-white/10">⏱️ {time}s</span>
        <button onClick={reset} className="px-3 py-1 rounded-lg bg-white text-black text-xs font-bold hover:scale-105 transition-transform">
          {over ? "💀" : won ? "🏆" : "😎"} Reset
        </button>
      </div>
      <div
        className="grid gap-px bg-black/40 p-px rounded-lg"
        style={{
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          width: "min(85vh, 560px)",
          aspectRatio: "1",
        }}
      >
        {board.map((row, r) => row.map((cell, c) => (
          <button
            key={`${r}-${c}`}
            onClick={() => click(r, c)}
            onContextMenu={(e) => flag(e, r, c)}
            className={`flex items-center justify-center text-xs sm:text-sm font-black transition-colors ${
              cell.revealed
                ? cell.mine
                  ? "bg-red-600"
                  : "bg-[var(--surface-2)]"
                : "bg-[var(--surface)] hover:bg-[var(--surface-2)]"
            }`}
            style={{ color: cell.revealed && !cell.mine ? NUM_COLOR[cell.adj] : "white" }}
          >
            {cell.flagged && !cell.revealed && "🚩"}
            {cell.revealed && cell.mine && "💣"}
            {cell.revealed && !cell.mine && cell.adj > 0 && cell.adj}
          </button>
        )))}
      </div>
      <div className="mt-2 text-[10px] text-white/50">
        Left-click to reveal • Right-click to flag
      </div>
      {(over || won) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70">
          <div className="text-5xl mb-2">{won ? "🏆" : "💥"}</div>
          <div className="text-3xl font-black text-white mb-2">
            {won ? "You won!" : "Boom!"}
          </div>
          {won && <div className="text-white/80 mb-4">in {time}s</div>}
          <button onClick={reset} className="px-6 py-3 rounded-lg bg-white text-black font-bold hover:scale-105 transition-transform">
            Play again
          </button>
        </div>
      )}
    </div>
  );
}
