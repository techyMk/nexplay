"use client";

import { useEffect, useMemo, useState } from "react";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";
import { GameOverlay, PauseToggle } from "@/components/games/GameOverlay";
import { SoundToggle } from "@/components/SoundToggle";
import { Sfx } from "@/lib/sound";

type Cell = { value: number; given: boolean; pencil: number[] };
type Board = Cell[][];

// Three pre-baked starting positions. (Building a generator is overkill for an MVP.)
const PUZZLES = [
  {
    diff: "Easy" as const,
    given:
      "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79",
    solution:
      "534678912672195348198342567859761423426853791713924856961537284287419635345286179",
  },
  {
    diff: "Medium" as const,
    given:
      "..9748...7........2.1.9.....7...24..64.1.59..98...3...3.....2..2.....97.....8..1.",
    solution:
      "519748632784623951261395847137462598645189273928537461396871425452316789873254176",
  },
  {
    diff: "Hard" as const,
    given:
      "8........3.6...9....7.....8.5..28.4.6...1.....92...........6..32.4......1....47..",
    solution:
      "812753649346982175957146283175628934638491752294375861489517326523864917761239458",
  },
];

type Difficulty = (typeof PUZZLES)[number]["diff"];

function parseBoard(s: string): Board {
  const b: Board = [];
  for (let r = 0; r < 9; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < 9; c++) {
      const ch = s[r * 9 + c];
      const v = ch === "." ? 0 : parseInt(ch, 10);
      row.push({ value: v, given: v > 0, pencil: [] });
    }
    b.push(row);
  }
  return b;
}

function loadPuzzle(idx: number) {
  const p = PUZZLES[idx % PUZZLES.length];
  return { board: parseBoard(p.given), solution: p.solution, diff: p.diff };
}

function isComplete(b: Board, sol: string) {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (b[r][c].value !== parseInt(sol[r * 9 + c], 10)) return false;
  return true;
}

export default function Sudoku() {
  const [puzzleIdx, setPuzzleIdx] = useState(0);
  const initial = useMemo(() => loadPuzzle(puzzleIdx), [puzzleIdx]);
  const [board, setBoard] = useState<Board>(initial.board);
  const [sel, setSel] = useState<{ r: number; c: number } | null>(null);
  const [errors, setErrors] = useState(0);
  const [time, setTime] = useState(0);
  const [won, setWon] = useState(false);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const submitStatus = useSubmitScoreOnGameOver(
    "sudoku",
    won ? Math.max(100, 5000 - errors * 200 - time * 2) : 0,
    won,
  );

  useEffect(() => {
    setBoard(initial.board);
    setErrors(0);
    setTime(0);
    setWon(false);
    setStarted(false);
    setPaused(false);
    setSel(null);
  }, [initial]);

  useEffect(() => {
    if (won || !started || paused) return;
    const id = setInterval(() => setTime((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [won, started, paused]);

  const setValue = (v: number) => {
    if (!sel || won || !started || paused) return;
    const cell = board[sel.r][sel.c];
    if (cell.given) return;
    setBoard((b) => {
      const next = b.map((row) => row.map((c) => ({ ...c, pencil: [...c.pencil] })));
      next[sel.r][sel.c].value = v;
      return next;
    });
    if (v === 0) {
      Sfx.click();
    } else if (parseInt(initial.solution[sel.r * 9 + sel.c], 10) !== v) {
      setErrors((e) => e + 1);
      Sfx.error();
    } else {
      Sfx.place();
    }
  };

  useEffect(() => {
    if (isComplete(board, initial.solution) && !won) {
      setWon(true);
      Sfx.win();
    }
  }, [board, initial.solution, won]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!sel) return;
      if (e.key >= "1" && e.key <= "9") setValue(parseInt(e.key, 10));
      else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") setValue(0);
      else if (e.key === "ArrowUp") setSel((s) => s && { ...s, r: Math.max(0, s.r - 1) });
      else if (e.key === "ArrowDown") setSel((s) => s && { ...s, r: Math.min(8, s.r + 1) });
      else if (e.key === "ArrowLeft") setSel((s) => s && { ...s, c: Math.max(0, s.c - 1) });
      else if (e.key === "ArrowRight") setSel((s) => s && { ...s, c: Math.min(8, s.c + 1) });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, board, initial.solution]);

  // Highlighting tied to difficulty:
  //   Easy   — row + column + 3×3 box + same-value cells (full helper)
  //   Medium — same 3×3 box only (no row/col, no same-value)
  //   Hard   — only the selected cell itself
  const diff = initial.diff;
  const inSameBox = (r: number, c: number) =>
    sel != null &&
    Math.floor(sel.r / 3) === Math.floor(r / 3) &&
    Math.floor(sel.c / 3) === Math.floor(c / 3);
  const inSameRowCol = (r: number, c: number) =>
    sel != null && (sel.r === r || sel.c === c);
  const selVal = sel ? board[sel.r][sel.c].value : 0;

  const highlightCell = (r: number, c: number): "selected" | "peer" | "same" | null => {
    if (!sel) return null;
    if (sel.r === r && sel.c === c) return "selected";
    if (diff === "Hard") return null;
    if (diff === "Easy" && inSameRowCol(r, c)) return "peer";
    if (inSameBox(r, c)) return "peer";
    if (diff === "Easy" && selVal > 0 && board[r][c].value === selVal) return "same";
    return null;
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-[var(--background)] text-[var(--foreground)] p-2 sm:p-3 select-none">
      {/* HUD */}
      <div className="shrink-0 flex items-center justify-center gap-2 mb-2 text-xs flex-wrap">
        <span className="px-2.5 py-1 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] inline-flex items-center gap-1.5">
          ⏱️
          <b className="font-mono tabular-nums">
            {String(Math.floor(time / 60)).padStart(2, "0")}:
            {String(time % 60).padStart(2, "0")}
          </b>
        </span>
        <span className="px-2.5 py-1 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] inline-flex items-center gap-1.5">
          <span className="text-[var(--accent-2)]">✕</span>
          <b className={errors > 3 ? "text-red-500" : ""}>{errors}</b>
        </span>
        {/* Difficulty segmented control */}
        <div className="inline-flex rounded-lg bg-[var(--surface-2)] border border-[var(--border)] p-0.5 text-[11px]">
          {PUZZLES.map((p, i) => (
            <button
              key={p.diff}
              onClick={() => setPuzzleIdx(i)}
              className={`px-2.5 py-1 rounded-md font-bold transition-all ${
                puzzleIdx === i
                  ? "bg-[var(--accent)] text-white shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {p.diff}
            </button>
          ))}
        </div>
        <SoundToggle />
        {started && !won && (
          <PauseToggle paused={paused} onClick={() => setPaused((p) => !p)} />
        )}
      </div>

      {/* Helper hint reflects what's currently being highlighted */}
      <div className="shrink-0 text-center text-[10px] text-[var(--muted)] -mt-1 mb-2">
        {diff === "Easy" && "Helpers: row · column · box · same digit"}
        {diff === "Medium" && "Helper: 3×3 box only"}
        {diff === "Hard" && "No helpers — only your cell is highlighted"}
      </div>

      {/* Board */}
      <div className="flex-1 min-h-0 w-full flex items-center justify-center">
        <div
          className="grid grid-cols-9 p-0 rounded-2xl bg-[var(--surface)] border-2 border-[var(--border-strong)] h-full max-w-full overflow-hidden"
          style={{
            aspectRatio: "1",
            gridTemplateRows: "repeat(9, 1fr)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          {board.map((row, r) =>
            row.map((cell, c) => {
              const wrong =
                !cell.given &&
                cell.value > 0 &&
                parseInt(initial.solution[r * 9 + c], 10) !== cell.value;
              const hl = highlightCell(r, c);
              const boxParity =
                (Math.floor(r / 3) + Math.floor(c / 3)) % 2 === 0;
              // Layered backgrounds: subtle box-parity tint (so 3×3
              // groups read at a glance) under the highlight tint.
              let bg = boxParity
                ? "bg-[var(--surface)]"
                : "bg-[var(--surface-2)]";
              let ring = "";
              if (wrong) {
                bg = "bg-red-500/15";
              } else if (hl === "selected") {
                bg = "bg-[var(--accent)]/25";
                ring = "ring-2 ring-[var(--accent)] ring-inset z-10";
              } else if (hl === "same") {
                bg = "bg-[var(--accent-2)]/18";
              } else if (hl === "peer") {
                bg = "bg-[var(--accent)]/10";
              }
              const textColor = cell.given
                ? "text-[var(--foreground)]"
                : wrong
                  ? "text-red-500"
                  : "text-[var(--accent)]";
              return (
                <button
                  key={`${r}-${c}`}
                  onClick={() => setSel({ r, c })}
                  className={`relative flex items-center justify-center text-lg sm:text-2xl font-semibold transition-colors ${bg} ${ring} ${
                    cell.given ? "" : "hover:bg-[var(--accent)]/15 cursor-pointer"
                  }`}
                  style={{
                    // Thin 1px line between cells, thicker 2px line
                    // between 3×3 boxes — drawn on right/bottom of
                    // each cell so we never double-border.
                    borderRight:
                      c < 8
                        ? c % 3 === 2
                          ? "2px solid var(--border-strong)"
                          : "1px solid var(--border)"
                        : undefined,
                    borderBottom:
                      r < 8
                        ? r % 3 === 2
                          ? "2px solid var(--border-strong)"
                          : "1px solid var(--border)"
                        : undefined,
                  }}
                >
                  <span className={textColor}>
                    {cell.value > 0 ? cell.value : ""}
                  </span>
                </button>
              );
            }),
          )}
        </div>
      </div>

      {/* Number pad + erase */}
      <div
        className="shrink-0 mt-3 mx-auto grid grid-cols-10 gap-1 sm:gap-1.5"
        style={{ width: "min(560px, 100%)" }}
      >
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button
            key={n}
            onClick={() => setValue(n)}
            disabled={!sel || won || paused || !started}
            className="aspect-square rounded-xl bg-[var(--surface-2)] border border-[var(--border)] hover:bg-[var(--accent)] hover:text-white hover:border-[var(--accent)] disabled:opacity-40 disabled:hover:bg-[var(--surface-2)] disabled:hover:text-[var(--foreground)] disabled:hover:border-[var(--border)] text-[var(--foreground)] font-black text-lg transition-all shadow-sm"
          >
            {n}
          </button>
        ))}
        <button
          onClick={() => setValue(0)}
          disabled={!sel || won || paused || !started}
          title="Erase"
          aria-label="Erase"
          className="aspect-square rounded-xl bg-[var(--surface-2)] border border-[var(--border)] hover:bg-red-500 hover:text-white hover:border-red-500 disabled:opacity-40 disabled:hover:bg-[var(--surface-2)] disabled:hover:text-[var(--foreground)] disabled:hover:border-[var(--border)] text-[var(--foreground)] font-black text-lg transition-all shadow-sm flex items-center justify-center"
        >
          ⌫
        </button>
      </div>

      {!started && !won && (
        <GameOverlay
          icon="🔢"
          title="Sudoku"
          subtitle={
            <>
              <b>{initial.diff}</b>. Fill the grid so every row, column, and
              3×3 box has 1-9.
            </>
          }
          primary={{ label: "▶ Play", onClick: () => setStarted(true) }}
        />
      )}
      {paused && started && !won && (
        <GameOverlay
          variant="blur"
          icon="⏸"
          title="Paused"
          subtitle="The clock is stopped — input is disabled until you resume."
          primary={{ label: "▶ Resume", onClick: () => setPaused(false) }}
        />
      )}
      {won && (
        <GameOverlay
          icon="🏆"
          title="Sudoku solved!"
          subtitle={`${initial.diff} · ${Math.floor(time / 60)}:${String(time % 60).padStart(2, "0")} · ${errors} mistake${errors === 1 ? "" : "s"}`}
          primary={{
            label: "Next puzzle",
            onClick: () => setPuzzleIdx((i) => (i + 1) % PUZZLES.length),
          }}
        >
          <ScoreStatus gameSlug="sudoku" status={submitStatus} />
        </GameOverlay>
      )}
    </div>
  );
}
