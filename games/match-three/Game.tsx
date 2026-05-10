"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";
import { GameOverlay } from "@/components/games/GameOverlay";
import { SoundToggle } from "@/components/SoundToggle";
import { Sfx } from "@/lib/sound";

const SIZE = 8;
const MOVES = 25;
const GEMS = ["💎", "🔮", "💚", "❤️", "💛", "🧡"];

type Board = number[][]; // 0..GEMS.length-1, or -1 for empty

function rand() {
  return Math.floor(Math.random() * GEMS.length);
}

function makeBoardNoMatches(): Board {
  while (true) {
    const b: Board = Array.from({ length: SIZE }, () =>
      Array.from({ length: SIZE }, () => rand()),
    );
    if (findMatches(b).length === 0) return b;
  }
}

function findMatches(b: Board): [number, number][] {
  const out: [number, number][] = [];
  // horizontal
  for (let r = 0; r < SIZE; r++) {
    let run = 1;
    for (let c = 1; c <= SIZE; c++) {
      if (c < SIZE && b[r][c] === b[r][c - 1] && b[r][c] !== -1) run++;
      else {
        if (run >= 3) for (let k = c - run; k < c; k++) out.push([r, k]);
        run = 1;
      }
    }
  }
  // vertical
  for (let c = 0; c < SIZE; c++) {
    let run = 1;
    for (let r = 1; r <= SIZE; r++) {
      if (r < SIZE && b[r][c] === b[r - 1][c] && b[r][c] !== -1) run++;
      else {
        if (run >= 3) for (let k = r - run; k < r; k++) out.push([k, c]);
        run = 1;
      }
    }
  }
  return out;
}

function gravityAndRefill(b: Board): Board {
  const next = b.map((row) => [...row]);
  for (let c = 0; c < SIZE; c++) {
    let write = SIZE - 1;
    for (let r = SIZE - 1; r >= 0; r--) {
      if (next[r][c] !== -1) {
        next[write][c] = next[r][c];
        if (write !== r) next[r][c] = -1;
        write--;
      }
    }
    for (let r = write; r >= 0; r--) next[r][c] = rand();
  }
  return next;
}

export default function MatchThree() {
  const [board, setBoard] = useState<Board>(() => makeBoardNoMatches());
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(MOVES);
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const overRef = useRef(false);
  const over = moves <= 0 && !busy;
  useEffect(() => {
    if (over) Sfx.gameOver();
  }, [over]);
  const submitStatus = useSubmitScoreOnGameOver("match-three", score, over);

  const cascade = useCallback((b0: Board): Promise<Board> => {
    return new Promise((resolve) => {
      let b = b0;
      let combo = 0;
      const step = () => {
        const matches = findMatches(b);
        if (matches.length === 0) {
          resolve(b);
          return;
        }
        combo++;
        if (combo === 1) Sfx.match();
        else Sfx.bigMatch();
        const cleared = b.map((row) => [...row]);
        for (const [r, c] of matches) cleared[r][c] = -1;
        const earned = matches.length * 10 * combo;
        setScore((s) => s + earned);
        setBoard(cleared);
        setTimeout(() => {
          b = gravityAndRefill(cleared);
          setBoard(b);
          setTimeout(step, 200);
        }, 220);
      };
      setTimeout(step, 50);
    });
  }, []);

  const swap = async (a: [number, number], b: [number, number]) => {
    if (busy) return;
    if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) !== 1) return;
    setBusy(true);
    const next = board.map((row) => [...row]);
    [next[a[0]][a[1]], next[b[0]][b[1]]] = [next[b[0]][b[1]], next[a[0]][a[1]]];
    setBoard(next);
    if (findMatches(next).length === 0) {
      // illegal; swap back
      Sfx.error();
      setTimeout(() => {
        setBoard((b2) => {
          const r = b2.map((row) => [...row]);
          [r[a[0]][a[1]], r[b[0]][b[1]]] = [r[b[0]][b[1]], r[a[0]][a[1]]];
          return r;
        });
        setBusy(false);
      }, 250);
      return;
    }
    setMoves((m) => m - 1);
    const settled = await cascade(next);
    setBoard(settled);
    setBusy(false);
  };

  const click = (r: number, c: number) => {
    if (busy || over || !started) return;
    if (!sel) {
      setSel([r, c]);
      return;
    }
    if (sel[0] === r && sel[1] === c) {
      setSel(null);
      return;
    }
    swap(sel, [r, c]);
    setSel(null);
  };

  const reset = () => {
    setBoard(makeBoardNoMatches());
    setScore(0);
    setMoves(MOVES);
    setSel(null);
    setBusy(false);
    setStarted(false);
    overRef.current = false;
  };

  const start = () => {
    setStarted(true);
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#1a0a2a] to-[#0b0d12] p-2 sm:p-3 select-none">
      <div className="shrink-0 flex items-center justify-center gap-3 mb-2 text-white text-xs sm:text-sm">
        <SoundToggle />
        <span className="px-3 py-1 rounded-lg bg-white/10">💎 {score}</span>
        <span className="px-3 py-1 rounded-lg bg-white/10">🔄 {moves}</span>
      </div>

      <div className="flex-1 min-h-0 w-full flex items-center justify-center">
        <div
          className="grid gap-1.5 p-2 rounded-2xl bg-black/40 border border-white/10 h-full max-w-full"
          style={{
            gridTemplateColumns: `repeat(${SIZE}, 1fr)`,
            gridTemplateRows: `repeat(${SIZE}, 1fr)`,
            aspectRatio: "1",
          }}
        >
          {board.map((row, r) =>
            row.map((g, c) => {
              const isSel = sel && sel[0] === r && sel[1] === c;
              return (
                <button
                  key={`${r}-${c}`}
                  onClick={() => click(r, c)}
                  className={`relative rounded-lg flex items-center justify-center text-xl sm:text-3xl transition-all ${
                    g === -1
                      ? "bg-transparent"
                      : isSel
                        ? "bg-[var(--accent)] scale-110 z-10"
                        : "bg-white/5 hover:bg-white/10"
                  }`}
                >
                  {g >= 0 ? GEMS[g] : ""}
                </button>
              );
            }),
          )}
        </div>
      </div>

      <div className="shrink-0 mt-2 text-[10px] text-white/50 text-center">
        Click two adjacent gems to swap. Match 3+ in a row.
      </div>

      {!started && !over && (
        <GameOverlay
          icon="💎"
          title="Match Three"
          subtitle={`${MOVES} moves to score as high as you can. Match 3+ gems in a row.`}
          primary={{ label: "▶ Play", onClick: start }}
        />
      )}
      {over && (
        <GameOverlay
          icon="🏆"
          title="Round complete!"
          subtitle={`Score: ${score}`}
          primary={{ label: "Play again", onClick: reset }}
        >
          <ScoreStatus gameSlug="match-three" status={submitStatus} />
        </GameOverlay>
      )}
    </div>
  );
}
