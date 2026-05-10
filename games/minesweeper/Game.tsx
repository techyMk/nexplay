"use client";

import { useEffect, useState } from "react";
import { GameOverlay } from "@/components/games/GameOverlay";
import { SoundToggle } from "@/components/SoundToggle";
import { Sfx } from "@/lib/sound";

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
  const [started, setStarted] = useState(false);
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
    if (remaining === 0) {
      setWon(true);
      Sfx.win();
    }
  }, [board, over, won]);

  const click = (r: number, c: number) => {
    if (over || won || !started) return;
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
      Sfx.gameOver();
      return;
    }
    reveal(b, r, c);
    setBoard(b);
    Sfx.click();
  };

  const flag = (e: React.MouseEvent, r: number, c: number) => {
    e.preventDefault();
    if (over || won) return;
    setBoard((b) => {
      const next = b.map((row) => row.map((cell) => ({ ...cell })));
      if (!next[r][c].revealed) next[r][c].flagged = !next[r][c].flagged;
      return next;
    });
    Sfx.place();
  };

  const reset = () => {
    setBoard(makeBoard());
    setFirst(true);
    setStarted(false);
    setOver(false);
    setWon(false);
    setTime(0);
  };

  const start = () => {
    setStarted(true);
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#0a1a2a] to-[#0b0d12] p-2 sm:p-3 select-none">
      <div className="shrink-0 flex items-center justify-center gap-3 mb-2 text-white text-xs sm:text-sm">
        <span className="px-3 py-1 rounded-lg bg-white/10">💣 {MINES - flags}</span>
        <span className="px-3 py-1 rounded-lg bg-white/10">⏱️ {time}s</span>
        <button onClick={reset} className="px-3 py-1 rounded-lg bg-white text-black text-xs font-bold hover:scale-105 transition-transform">
          {over ? "💀" : won ? "🏆" : "😎"} Reset
        </button>
        <SoundToggle />
      </div>
      <div className="flex-1 min-h-0 w-full flex items-center justify-center">
      <div
        className="grid gap-px bg-black/40 p-px rounded-lg h-full max-w-full"
        style={{
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gridTemplateRows: `repeat(${ROWS}, 1fr)`,
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
      </div>
      <div className="shrink-0 mt-2 text-[10px] text-white/50 text-center">
        Left-click to reveal • Right-click to flag
      </div>
      {!started && !over && !won && (
        <GameOverlay
          icon="💣"
          title="Minesweeper"
          subtitle={`${ROWS}×${COLS} grid · ${MINES} mines · Right-click to flag.`}
          primary={{ label: "▶ Play", onClick: start }}
        />
      )}
      {(over || won) && (
        <GameOverlay
          icon={won ? "🏆" : "💥"}
          title={won ? "You won!" : "Boom!"}
          subtitle={won ? `in ${time}s` : undefined}
          primary={{ label: "Play again", onClick: reset }}
        />
      )}
    </div>
  );
}
