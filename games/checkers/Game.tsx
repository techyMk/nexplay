"use client";

import { useState } from "react";

type Piece = { color: "r" | "b"; king: boolean } | null;
type Board = Piece[][];

function startBoard(): Board {
  const b: Board = Array.from({ length: 8 }, () => Array<Piece>(8).fill(null));
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 8; c++)
      if ((r + c) % 2 === 1) b[r][c] = { color: "r", king: false };
  for (let r = 5; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if ((r + c) % 2 === 1) b[r][c] = { color: "b", king: false };
  return b;
}

function inBounds(r: number, c: number) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function legalMoves(b: Board, r: number, c: number): { to: [number, number]; capture: [number, number] | null }[] {
  const p = b[r][c];
  if (!p) return [];
  const dirs: [number, number][] = [];
  if (p.king || p.color === "b") dirs.push([-1, -1], [-1, 1]);
  if (p.king || p.color === "r") dirs.push([1, -1], [1, 1]);
  const moves: { to: [number, number]; capture: [number, number] | null }[] = [];
  for (const [dr, dc] of dirs) {
    const r1 = r + dr, c1 = c + dc;
    if (inBounds(r1, c1) && !b[r1][c1]) moves.push({ to: [r1, c1], capture: null });
    const r2 = r + 2 * dr, c2 = c + 2 * dc;
    if (
      inBounds(r2, c2) &&
      !b[r2][c2] &&
      b[r1]?.[c1] &&
      b[r1][c1]!.color !== p.color
    )
      moves.push({ to: [r2, c2], capture: [r1, c1] });
  }
  return moves;
}

function hasAnyMove(b: Board, color: "r" | "b") {
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (b[r][c]?.color === color && legalMoves(b, r, c).length > 0) return true;
  return false;
}

export default function Checkers() {
  const [board, setBoard] = useState<Board>(startBoard);
  const [turn, setTurn] = useState<"r" | "b">("b");
  const [sel, setSel] = useState<[number, number] | null>(null);

  const winner = !hasAnyMove(board, turn) ? (turn === "r" ? "b" : "r") : null;

  const moves = sel ? legalMoves(board, sel[0], sel[1]) : [];

  const click = (r: number, c: number) => {
    if (winner) return;
    const p = board[r][c];
    if (sel) {
      const found = moves.find((m) => m.to[0] === r && m.to[1] === c);
      if (found) {
        const next = board.map((row) => row.map((cell) => (cell ? { ...cell } : cell)));
        const [sr, sc] = sel;
        const piece = next[sr][sc]!;
        next[sr][sc] = null;
        if (found.capture) next[found.capture[0]][found.capture[1]] = null;
        if ((piece.color === "b" && r === 0) || (piece.color === "r" && r === 7))
          piece.king = true;
        next[r][c] = piece;
        setBoard(next);
        setSel(null);
        setTurn(turn === "r" ? "b" : "r");
        return;
      }
      if (p && p.color === turn) {
        setSel([r, c]);
        return;
      }
      setSel(null);
      return;
    }
    if (p && p.color === turn) setSel([r, c]);
  };

  const reset = () => {
    setBoard(startBoard());
    setSel(null);
    setTurn("b");
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#1a0a0a] to-[#0b0d12] p-2 sm:p-3">
      <div className="shrink-0 flex items-center justify-center gap-3 mb-2 text-white text-xs sm:text-sm">
        <span className={turn === "b" && !winner ? "font-bold" : "opacity-50"}>
          ⚫ Black {turn === "b" && !winner ? "(your turn)" : ""}
        </span>
        <span className="opacity-40">vs</span>
        <span className={turn === "r" && !winner ? "font-bold" : "opacity-50"}>
          🔴 Red {turn === "r" && !winner ? "(your turn)" : ""}
        </span>
      </div>

      <div className="flex-1 min-h-0 w-full flex items-center justify-center">
      <div
        className="grid grid-cols-8 grid-rows-8 rounded-lg overflow-hidden border-4 border-amber-900 h-full max-w-full"
        style={{ aspectRatio: "1" }}
      >
        {board.flatMap((row, r) =>
          row.map((p, c) => {
            const dark = (r + c) % 2 === 1;
            const isSel = sel && sel[0] === r && sel[1] === c;
            const isMove = moves.some((m) => m.to[0] === r && m.to[1] === c);
            return (
              <button
                key={`${r}-${c}`}
                onClick={() => click(r, c)}
                disabled={!dark}
                className="relative flex items-center justify-center"
                style={{
                  background: dark ? "#7c4a2a" : "#f5deb3",
                  boxShadow: isSel ? "inset 0 0 0 4px #facc15" : isMove ? "inset 0 0 0 4px rgba(124,92,255,0.7)" : "none",
                }}
              >
                {p && (
                  <div
                    className="w-[78%] aspect-square rounded-full flex items-center justify-center text-xl"
                    style={{
                      background:
                        p.color === "r"
                          ? "radial-gradient(circle at 30% 30%, #ff6666, #b91c1c)"
                          : "radial-gradient(circle at 30% 30%, #4a4a4a, #0a0a0a)",
                      boxShadow: "0 4px 8px rgba(0,0,0,0.5)",
                    }}
                  >
                    {p.king && <span className="text-yellow-300 drop-shadow">♛</span>}
                  </div>
                )}
                {isMove && !p && (
                  <div className="w-3 h-3 rounded-full bg-[var(--accent)]/70" />
                )}
              </button>
            );
          }),
        )}
      </div>
      </div>

      {winner && (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center">
          <div className="text-4xl font-black text-white mb-4">
            {winner === "b" ? "⚫ Black wins!" : "🔴 Red wins!"}
          </div>
          <button
            onClick={reset}
            className="px-6 py-3 rounded-lg bg-white text-black font-bold hover:scale-105 transition-transform"
          >
            Play again
          </button>
        </div>
      )}

      <button
        onClick={reset}
        className="shrink-0 mt-2 mx-auto px-4 py-2 rounded-lg bg-white/10 text-white text-xs font-bold hover:bg-white/20 transition-colors"
      >
        Reset
      </button>
    </div>
  );
}
