"use client";

import { useEffect, useRef, useState } from "react";
import { GameOverlay } from "@/components/games/GameOverlay";
import { SoundToggle } from "@/components/SoundToggle";
import { Sfx } from "@/lib/sound";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";

const COLS = 16;
const ROWS = 16;
const MINES = 40;
const SAFE_CELLS = COLS * ROWS - MINES;
/** Per-cell reveal payoff in points. */
const POINTS_PER_REVEAL = 10;

type CellState = {
  mine: boolean;
  revealed: boolean;
  flagged: boolean;
  adj: number;
};

function makeBoard(seed?: { row: number; col: number }): CellState[][] {
  const board: CellState[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => ({
      mine: false,
      revealed: false,
      flagged: false,
      adj: 0,
    })),
  );
  let placed = 0;
  while (placed < MINES) {
    const r = Math.floor(Math.random() * ROWS);
    const c = Math.floor(Math.random() * COLS);
    if (board[r][c].mine) continue;
    if (
      seed &&
      Math.abs(r - seed.row) <= 1 &&
      Math.abs(c - seed.col) <= 1
    )
      continue;
    board[r][c].mine = true;
    placed++;
  }
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c].mine) continue;
      let n = 0;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if (
            rr >= 0 &&
            rr < ROWS &&
            cc >= 0 &&
            cc < COLS &&
            board[rr][cc].mine
          )
            n++;
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

function countRevealedSafe(b: CellState[][]): number {
  let n = 0;
  for (const row of b) for (const cell of row) if (cell.revealed && !cell.mine) n++;
  return n;
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
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [bonus, setBonus] = useState(0);
  const flags = board.flat().filter((c) => c.flagged).length;
  const revealedRef = useRef(0);
  // Submits the score to the global leaderboard whenever the game
  // ends (win or loss). Wins naturally end up higher because of the
  // time-bonus, but lost runs with lots of revealed cells still
  // count for ranking.
  const submitStatus = useSubmitScoreOnGameOver(
    "minesweeper",
    score,
    over || won,
  );

  // Pull best out of localStorage on mount.
  useEffect(() => {
    setBest(Number(localStorage.getItem("nexplay:minesweeper-best") || 0));
  }, []);

  useEffect(() => {
    if (over || won || first) return;
    const id = setInterval(() => setTime((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [over, won, first]);

  useEffect(() => {
    if (over || won) return;
    const remaining = board
      .flat()
      .filter((c) => !c.revealed && !c.mine).length;
    if (remaining === 0) {
      setWon(true);
      // Time bonus rewards fast clears; tapers to 0 after ~3 minutes.
      const tBonus = Math.max(0, 800 - time * 5);
      setBonus(tBonus);
      setScore((s) => s + tBonus);
      Sfx.win();
    }
  }, [board, over, won, time]);

  // Persist personal best on any game end (win OR loss). A loss with
  // a high cell-reveal count is still a meaningful run and should be
  // remembered locally. The leaderboard hook above handles the
  // global submission.
  useEffect(() => {
    if (!(over || won)) return;
    if (score <= best) return;
    setBest(score);
    try {
      localStorage.setItem("nexplay:minesweeper-best", String(score));
    } catch {
      // localStorage can throw in private mode — best is nice-to-have
    }
  }, [over, won, score, best]);

  const click = (r: number, c: number) => {
    if (over || won || !started) return;
    let b: CellState[][];
    if (first) {
      b = makeBoard({ row: r, col: c });
      setFirst(false);
      setTime(0);
      setScore(0);
      revealedRef.current = 0;
    } else {
      b = board.map((row) => row.map((cell) => ({ ...cell })));
    }
    if (b[r][c].flagged) return;
    if (b[r][c].mine) {
      // reveal all mines
      b.forEach((row) =>
        row.forEach((cell) => {
          if (cell.mine) cell.revealed = true;
        }),
      );
      setBoard(b);
      setOver(true);
      Sfx.gameOver();
      return;
    }
    reveal(b, r, c);
    setBoard(b);
    // Score = newly-revealed safe cells × points per cell. Counted
    // through a ref so the cascade reveals from a single click are
    // all rolled into one delta instead of being lost across React
    // batches.
    const totalRevealed = countRevealedSafe(b);
    const earned = (totalRevealed - revealedRef.current) * POINTS_PER_REVEAL;
    revealedRef.current = totalRevealed;
    if (earned > 0) {
      setScore((s) => s + earned);
    }
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
    setScore(0);
    setBonus(0);
    revealedRef.current = 0;
  };

  const start = () => {
    setStarted(true);
  };

  const faceEmoji = won ? "😎" : over ? "💀" : "🙂";

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#0a1a2a] to-[#0b0d12] p-2 sm:p-3 select-none">
      {/* HUD — tighter pills, score in the centre group */}
      <div className="shrink-0 flex items-center justify-center gap-2 mb-3 text-white flex-wrap">
        {/* Mines remaining — red retro LCD pill */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0e1422] border border-red-500/40 shadow-[inset_0_2px_3px_rgba(0,0,0,0.6)]">
          <span aria-hidden className="text-xs">💣</span>
          <span className="font-mono text-sm text-red-300 tabular-nums tracking-wider">
            {String(Math.max(-99, MINES - flags)).padStart(2, "0")}
          </span>
        </div>
        {/* Score pill — emerald */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0e1422] border border-emerald-500/40 shadow-[inset_0_2px_3px_rgba(0,0,0,0.6)]">
          <span className="text-[10px] uppercase tracking-wider text-emerald-300/70 font-bold">
            Score
          </span>
          <span className="font-mono text-sm text-emerald-300 tabular-nums">
            {score}
          </span>
        </div>
        {/* Reset button — Win-classic smiley face */}
        <button
          onClick={reset}
          aria-label="Reset"
          title="Reset"
          className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-300 to-amber-500 border-2 border-amber-600/50 shadow-[inset_2px_2px_0_rgba(255,255,255,0.45),inset_-2px_-2px_0_rgba(0,0,0,0.25),0_2px_4px_rgba(0,0,0,0.4)] flex items-center justify-center text-xl hover:from-amber-200 hover:to-amber-400 active:scale-95 transition-transform"
        >
          {faceEmoji}
        </button>
        {/* Timer — amber retro LCD pill */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0e1422] border border-amber-500/40 shadow-[inset_0_2px_3px_rgba(0,0,0,0.6)]">
          <span aria-hidden className="text-xs">⏱️</span>
          <span className="font-mono text-sm text-amber-300 tabular-nums tracking-wider">
            {String(Math.min(999, time)).padStart(3, "0")}
          </span>
        </div>
        {/* Best — small pill, only when there is one */}
        {best > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5 border border-white/10">
            <span className="text-[10px] uppercase tracking-wider text-white/50 font-bold">
              Best
            </span>
            <span className="font-mono text-sm text-white/80 tabular-nums">
              {best}
            </span>
          </div>
        )}
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
                  // Numbers + emoji are sized down to text-[11px]/
                  // text-[13px] so they sit comfortably inside the
                  // ~36 px cell instead of crowding it. Bombs use a
                  // small SVG (rendered below) instead of emoji so the
                  // size is consistent across browsers/OSs.
                  className={`relative flex items-center justify-center text-[11px] sm:text-[13px] font-bold transition-colors duration-150 rounded-[3px] ${
                    isRevealedMine
                      ? "bg-gradient-to-br from-red-500 to-red-700 shadow-[inset_0_0_8px_rgba(0,0,0,0.55)]"
                      : isRevealedSafe
                        ? "bg-[#1a2030] shadow-[inset_2px_2px_0_rgba(0,0,0,0.55),inset_-1px_-1px_0_rgba(255,255,255,0.05)]"
                        : "bg-gradient-to-br from-[#3d4863] via-[#2c344a] to-[#1f2638] shadow-[inset_2px_2px_0_rgba(255,255,255,0.18),inset_-2px_-2px_0_rgba(0,0,0,0.5)] hover:from-[#4a5573] hover:via-[#384058] hover:to-[#252b3e]"
                  }`}
                  style={{
                    color: isRevealedSafe ? NUM_COLOR[cell.adj] : "white",
                  }}
                >
                  {cell.flagged && isUnrevealed && <FlagIcon />}
                  {isRevealedMine && <BombIcon />}
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
          subtitle={`${ROWS}×${COLS} grid · ${MINES} mines · clear all the safe cells.`}
          primary={{ label: "▶ Play", onClick: start }}
        />
      )}
      {(over || won) && (
        <GameOverlay
          icon={won ? "🏆" : "💥"}
          title={won ? "You won!" : "Boom!"}
          subtitle={
            won
              ? `${time}s · ${revealedRef.current}/${SAFE_CELLS} cells · time bonus +${bonus}`
              : `Revealed ${revealedRef.current}/${SAFE_CELLS} · best ${Math.max(best, score)}`
          }
          primary={{ label: "Play again", onClick: reset }}
        >
          <div className="text-3xl font-black text-emerald-400">
            Score: {score}
          </div>
          <ScoreStatus gameSlug="minesweeper" status={submitStatus} />
        </GameOverlay>
      )}
    </div>
  );
}

/** Compact bomb glyph rendered as inline SVG so it scales cleanly
 *  inside the small grid cells regardless of OS-level emoji
 *  variants. Black body, fuse, small white highlight. */
function BombIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden
      className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]"
    >
      <circle cx="8" cy="10" r="5.2" fill="#0a0a0a" />
      <circle cx="6" cy="8.2" r="1.4" fill="#525d7a" />
      <line
        x1="11"
        y1="5"
        x2="13.5"
        y2="2.5"
        stroke="#0a0a0a"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="13.5" cy="2.5" r="1.2" fill="#facc15" />
    </svg>
  );
}

/** Small flag glyph — triangle on a vertical post, base at the
 *  bottom. Drawn as SVG to match BombIcon's clean scaling. */
function FlagIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="13"
      height="13"
      aria-hidden
      className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]"
    >
      <line
        x1="6"
        y1="3"
        x2="6"
        y2="13"
        stroke="#1f2937"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <polygon points="6,3 13,5.5 6,8" fill="#ef4444" />
      <rect x="3.5" y="12.5" width="5" height="1.4" fill="#1f2937" rx="0.5" />
    </svg>
  );
}
