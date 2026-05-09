"use client";

import { useEffect, useMemo, useState } from "react";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";

type Cell = { value: number; given: boolean; pencil: number[] };
type Board = Cell[][];

// Three pre-baked starting positions. (Building a generator is overkill for an MVP.)
const PUZZLES = [
  {
    diff: "Easy",
    given:
      "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79",
    solution:
      "534678912672195348198342567859761423426853791713924856961537284287419635345286179",
  },
  {
    diff: "Medium",
    given:
      "..9748...7........2.1.9.....7...24..64.1.59..98...3...3.....2..2.....97.....8..1.",
    solution:
      "519748632784623951261395847137462598645189273928537461396871425452316789873254176",
  },
  {
    diff: "Hard",
    given:
      "8........3.6...9....7.....8.5..28.4.6...1.....92...........6..32.4......1....47..",
    solution:
      "812753649346982175957146283175628934638491752294375861489517326523864917761239458",
  },
];

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
    setSel(null);
  }, [initial]);

  useEffect(() => {
    if (won) return;
    const id = setInterval(() => setTime((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [won]);

  const setValue = (v: number) => {
    if (!sel || won) return;
    const cell = board[sel.r][sel.c];
    if (cell.given) return;
    setBoard((b) => {
      const next = b.map((row) => row.map((c) => ({ ...c, pencil: [...c.pencil] })));
      next[sel.r][sel.c].value = v;
      return next;
    });
    if (v > 0 && parseInt(initial.solution[sel.r * 9 + sel.c], 10) !== v) {
      setErrors((e) => e + 1);
    }
  };

  useEffect(() => {
    if (isComplete(board, initial.solution)) setWon(true);
  }, [board, initial.solution]);

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

  const isSelectedRow = (r: number) => sel?.r === r;
  const isSelectedCol = (c: number) => sel?.c === c;
  const isSameBox = (r: number, c: number) =>
    sel && Math.floor(sel.r / 3) === Math.floor(r / 3) && Math.floor(sel.c / 3) === Math.floor(c / 3);
  const selVal = sel ? board[sel.r][sel.c].value : 0;

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#0a0a18] to-[#0b0d12] p-4 select-none">
      <div className="flex items-center gap-3 mb-3 text-white text-sm flex-wrap justify-center">
        <span className="px-3 py-1 rounded-lg bg-white/10">📊 {initial.diff}</span>
        <span className="px-3 py-1 rounded-lg bg-white/10">⏱️ {time}s</span>
        <span className="px-3 py-1 rounded-lg bg-white/10">❌ {errors}</span>
        <select
          value={puzzleIdx}
          onChange={(e) => setPuzzleIdx(parseInt(e.target.value, 10))}
          className="px-3 py-1 rounded-lg bg-white/10 text-white text-xs"
        >
          <option value={0}>Easy</option>
          <option value={1}>Medium</option>
          <option value={2}>Hard</option>
        </select>
      </div>

      <div
        className="grid grid-cols-9 gap-px p-1 rounded-lg bg-black/60 border border-white/20"
        style={{
          width: "min(85vh, 92vw, 540px)",
          maxWidth: "100%",
          aspectRatio: "1",
          gridTemplateRows: "repeat(9, 1fr)",
        }}
      >
        {board.map((row, r) =>
          row.map((cell, c) => {
            const sameVal = cell.value > 0 && cell.value === selVal;
            const wrong =
              !cell.given &&
              cell.value > 0 &&
              parseInt(initial.solution[r * 9 + c], 10) !== cell.value;
            const isSel = sel?.r === r && sel?.c === c;
            const highlighted = isSelectedRow(r) || isSelectedCol(c) || isSameBox(r, c);
            return (
              <button
                key={`${r}-${c}`}
                onClick={() => setSel({ r, c })}
                className={`relative flex items-center justify-center text-base sm:text-xl font-bold transition-colors ${
                  isSel
                    ? "bg-[var(--accent)]/40 text-white"
                    : highlighted
                      ? "bg-white/10 text-white"
                      : "bg-[var(--surface-2)] text-white"
                }`}
                style={{
                  borderRight: c % 3 === 2 && c !== 8 ? "2px solid rgba(255,255,255,0.4)" : undefined,
                  borderBottom: r % 3 === 2 && r !== 8 ? "2px solid rgba(255,255,255,0.4)" : undefined,
                }}
              >
                <span
                  className={`${cell.given ? "text-white" : wrong ? "text-red-400" : "text-[var(--accent)]"} ${sameVal && !isSel ? "underline" : ""}`}
                >
                  {cell.value > 0 ? cell.value : ""}
                </span>
              </button>
            );
          }),
        )}
      </div>

      {/* Number pad */}
      <div className="mt-3 grid grid-cols-9 gap-1.5" style={{ width: "min(85vh, 92vw, 540px)" }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button
            key={n}
            onClick={() => setValue(n)}
            className="aspect-square rounded-lg bg-[var(--surface-2)] hover:bg-[var(--accent)] text-white font-black text-lg transition-colors"
          >
            {n}
          </button>
        ))}
      </div>
      <button
        onClick={() => setValue(0)}
        className="mt-2 px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors"
      >
        Erase
      </button>

      {won && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-2">
          <div className="text-5xl">🏆</div>
          <div className="text-3xl font-black text-white">Sudoku solved!</div>
          <div className="text-white/80">{time}s • {errors} mistakes</div>
          <ScoreStatus gameSlug="sudoku" status={submitStatus} />
          <button
            onClick={() => setPuzzleIdx((i) => (i + 1) % PUZZLES.length)}
            className="mt-2 px-6 py-3 rounded-lg bg-white text-black font-bold hover:scale-105 transition-transform"
          >
            Next puzzle
          </button>
        </div>
      )}
    </div>
  );
}
