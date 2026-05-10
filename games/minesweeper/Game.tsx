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

// Classic Minesweeper number colours, modernised slightly for the
// dark theme but keeping the at-a-glance "1 = blue, 2 = green, 3 =
// red" reading.
const NUM_COLOR = [
  "",
  "#60a5fa",
  "#4ade80",
  "#f87171",
  "#a78bfa",
  "#fb923c",
  "#22d3ee",
  "#f472b6",
  "#facc15",
];

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

  // Reset-button face — animates with game state, classic
  // Minesweeper cue.
  const faceEmoji = won ? "😎" : over ? "💀" : "🙂";

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#0a1a2a] to-[#0b0d12] p-2 sm:p-3 select-none">
      <div className="shrink-0 flex items-center justify-center gap-2 sm:gap-3 mb-3 text-white">
        {/* Mines remaining — red retro LCD pill */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0e1422] border border-red-500/40 shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]">
          <span aria-hidden>💣</span>
          <span className="font-mono text-base text-red-300 tabular-nums tracking-wider">
            {String(Math.max(-99, MINES - flags)).padStart(2, "0")}
          </span>
        </div>
        {/* Reset button — Win-classic smiley face */}
        <button
          onClick={reset}
          aria-label="Reset"
          title="Reset"
          className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-300 to-amber-500 border-2 border-amber-600/50 shadow-[inset_2px_2px_0_rgba(255,255,255,0.45),inset_-2px_-2px_0_rgba(0,0,0,0.25),0_2px_4px_rgba(0,0,0,0.4)] flex items-center justify-center text-2xl hover:from-amber-200 hover:to-amber-400 active:scale-95 transition-transform"
        >
          {faceEmoji}
        </button>
        {/* Timer — amber retro LCD pill */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0e1422] border border-amber-500/40 shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]">
          <span aria-hidden>⏱️</span>
          <span className="font-mono text-base text-amber-300 tabular-nums tracking-wider">
            {String(Math.min(999, time)).padStart(3, "0")}
          </span>
        </div>
        <SoundToggle />
      </div>
      <div className="flex-1 min-h-0 w-full flex items-center justify-center">
        <div
          className="grid gap-[2px] p-2 rounded-2xl bg-gradient-to-br from-[#0e1422] to-[#070a14] border border-white/10 shadow-[0_0_24px_rgba(0,0,0,0.45)] h-full max-w-full"
          style={{
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            gridTemplateRows: `repeat(${ROWS}, 1fr)`,
            aspectRatio: "1",
          }}
        >
          {board.map((row, r) =>
            row.map((cell, c) => {
              const isUnrevealed = !cell.revealed;
              const isRevealedMine = cell.revealed && cell.mine;
              const isRevealedSafe = cell.revealed && !cell.mine;
              return (
                <button
                  key={`${r}-${c}`}
                  onClick={() => click(r, c)}
                  onContextMenu={(e) => flag(e, r, c)}
                  className={`relative flex items-center justify-center text-base sm:text-lg font-black transition-all duration-150 rounded-[3px] ${
                    isRevealedMine
                      ? "bg-gradient-to-br from-red-500 to-red-700 shadow-[inset_0_0_8px_rgba(0,0,0,0.55)]"
                      : isRevealedSafe
                        ? "bg-[#1a2030] shadow-[inset_2px_2px_3px_rgba(0,0,0,0.55),inset_-1px_-1px_0_rgba(255,255,255,0.04)]"
                        : "bg-gradient-to-br from-[#3d4863] via-[#2c344a] to-[#1f2638] shadow-[inset_2px_2px_0_rgba(255,255,255,0.18),inset_-2px_-2px_0_rgba(0,0,0,0.5)] hover:from-[#4a5573] hover:via-[#384058] hover:to-[#252b3e] active:scale-[0.94]"
                  }`}
                  style={{
                    color: isRevealedSafe
                      ? NUM_COLOR[cell.adj]
                      : "white",
                    textShadow: isRevealedSafe
                      ? "0 1px 2px rgba(0,0,0,0.7)"
                      : undefined,
                  }}
                >
                  {cell.flagged && isUnrevealed && (
                    <span
                      className="text-base sm:text-lg drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]"
                      aria-hidden
                    >
                      🚩
                    </span>
                  )}
                  {isRevealedMine && (
                    <span
                      className="text-base sm:text-xl drop-shadow-[0_0_4px_rgba(0,0,0,0.7)]"
                      aria-hidden
                    >
                      💣
                    </span>
                  )}
                  {isRevealedSafe && cell.adj > 0 && cell.adj}
                </button>
              );
            }),
          )}
        </div>
      </div>
      <div className="shrink-0 mt-2 text-[11px] text-white/55 text-center">
        Left-click to reveal · Right-click to flag · Smiley to reset
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
