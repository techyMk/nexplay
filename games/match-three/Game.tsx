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

/** Power-gem kinds. `row` clears the entire row when activated,
 *  `col` clears the entire column, `bomb` clears every gem of the
 *  same colour. Created by matches of 4 (striped) or 5 (bomb). */
type Special = "row" | "col" | "bomb";

/** A single board cell. `g` is the gem index 0..GEMS.length-1, or
 *  `-1` for an empty slot mid-cascade (gravity hasn't refilled yet).
 *  `sp` upgrades a regular gem into a power gem. */
type Cell = { g: number; sp?: Special };
type Board = Cell[][];

/** A continuous run of 3+ same-coloured gems detected on the board.
 *  We track direction so 4-runs can spawn the right striped variant. */
type Run = {
  cells: [number, number][];
  gem: number;
  dir: "h" | "v";
};

const POWER_BONUS = { row: 100, col: 100, bomb: 250 } as const;

function rand(): number {
  return Math.floor(Math.random() * GEMS.length);
}

function makeBoardNoMatches(): Board {
  while (true) {
    const b: Board = Array.from({ length: SIZE }, () =>
      Array.from({ length: SIZE }, (): Cell => ({ g: rand() })),
    );
    if (findRuns(b).length === 0) return b;
  }
}

function findRuns(b: Board): Run[] {
  const runs: Run[] = [];
  // horizontal
  for (let r = 0; r < SIZE; r++) {
    let start = 0;
    for (let c = 1; c <= SIZE; c++) {
      const same =
        c < SIZE && b[r][c].g !== -1 && b[r][c].g === b[r][c - 1].g;
      if (!same) {
        const len = c - start;
        if (len >= 3) {
          const cells: [number, number][] = [];
          for (let k = start; k < c; k++) cells.push([r, k]);
          runs.push({ cells, gem: b[r][start].g, dir: "h" });
        }
        start = c;
      }
    }
  }
  // vertical
  for (let c = 0; c < SIZE; c++) {
    let start = 0;
    for (let r = 1; r <= SIZE; r++) {
      const same =
        r < SIZE && b[r][c].g !== -1 && b[r][c].g === b[r - 1][c].g;
      if (!same) {
        const len = r - start;
        if (len >= 3) {
          const cells: [number, number][] = [];
          for (let k = start; k < r; k++) cells.push([k, c]);
          runs.push({ cells, gem: b[start][c].g, dir: "v" });
        }
        start = r;
      }
    }
  }
  return runs;
}

function gravityAndRefill(b: Board): Board {
  const next: Board = b.map((row) => row.map((cell) => ({ ...cell })));
  for (let c = 0; c < SIZE; c++) {
    let write = SIZE - 1;
    for (let r = SIZE - 1; r >= 0; r--) {
      if (next[r][c].g !== -1) {
        next[write][c] = next[r][c];
        if (write !== r) next[r][c] = { g: -1 };
        write--;
      }
    }
    for (let r = write; r >= 0; r--) next[r][c] = { g: rand() };
  }
  return next;
}

/** Resolve the runs into a clear-set + upgrade list. Power gems
 *  caught in the clear-set fire their effect (which may pull more
 *  cells into the clear), and we iterate until the set stabilises. */
function resolveClears(
  b: Board,
  runs: Run[],
): {
  clear: Set<string>;
  upgrades: { r: number; c: number; gem: number; sp: Special }[];
} {
  const clear = new Set<string>();
  const upgrades: { r: number; c: number; gem: number; sp: Special }[] = [];
  const upgradeSet = new Set<string>();

  // For each run with length >= 4, reserve the middle cell as a
  // power-gem upgrade — those cells survive the clear with the new
  // sp marker. 4-run → striped (oriented with the run), 5+ → bomb.
  for (const run of runs) {
    if (run.cells.length >= 5) {
      const mid = run.cells[Math.floor(run.cells.length / 2)];
      upgrades.push({ r: mid[0], c: mid[1], gem: run.gem, sp: "bomb" });
      upgradeSet.add(`${mid[0]},${mid[1]}`);
    } else if (run.cells.length === 4) {
      const mid = run.cells[Math.floor(run.cells.length / 2)];
      upgrades.push({
        r: mid[0],
        c: mid[1],
        gem: run.gem,
        sp: run.dir === "h" ? "row" : "col",
      });
      upgradeSet.add(`${mid[0]},${mid[1]}`);
    }
  }
  for (const run of runs) {
    for (const [r, c] of run.cells) {
      if (!upgradeSet.has(`${r},${c}`)) clear.add(`${r},${c}`);
    }
  }

  // Expand clear-set via power-gem effects until it stabilises.
  // Each power gem in the cleared set fires once; subsequent firings
  // can pull other power gems in, which then chain.
  const fired = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const k of Array.from(clear)) {
      if (fired.has(k)) continue;
      fired.add(k);
      const [r, c] = k.split(",").map(Number);
      const cell = b[r][c];
      if (!cell.sp) continue;
      changed = true;
      if (cell.sp === "row") {
        for (let cc = 0; cc < SIZE; cc++) clear.add(`${r},${cc}`);
      } else if (cell.sp === "col") {
        for (let rr = 0; rr < SIZE; rr++) clear.add(`${rr},${c}`);
      } else if (cell.sp === "bomb") {
        const target = cell.g;
        for (let rr = 0; rr < SIZE; rr++) {
          for (let cc = 0; cc < SIZE; cc++) {
            if (b[rr][cc].g === target) clear.add(`${rr},${cc}`);
          }
        }
      }
    }
  }

  return { clear, upgrades };
}

type Popup = {
  id: number;
  r: number;
  c: number;
  text: string;
  tone: "score" | "power";
};

export default function MatchThree() {
  const [board, setBoard] = useState<Board>(() => makeBoardNoMatches());
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(MOVES);
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [best, setBest] = useState(0);
  const [comboBanner, setComboBanner] = useState<number>(0);
  const [popups, setPopups] = useState<Popup[]>([]);
  const popupId = useRef(0);

  const over = moves <= 0 && !busy;
  const submitStatus = useSubmitScoreOnGameOver("match-three", score, over);

  // Load best on mount; persist when run ends and we beat it.
  useEffect(() => {
    setBest(Number(localStorage.getItem("nexplay:match-three-best") || 0));
  }, []);
  useEffect(() => {
    if (!over) return;
    Sfx.gameOver();
    if (score > best) {
      setBest(score);
      try {
        localStorage.setItem("nexplay:match-three-best", String(score));
      } catch {
        // private mode — best is nice-to-have
      }
    }
  }, [over, score, best]);

  /** Spawn a floating "+N" popup at a board cell. The popup is keyed
   *  by an incrementing id and removed after ~800ms; the CSS handles
   *  the float-up + fade. */
  const addPopup = useCallback(
    (r: number, c: number, text: string, tone: Popup["tone"] = "score") => {
      const id = ++popupId.current;
      setPopups((ps) => [...ps, { id, r, c, text, tone }]);
      setTimeout(() => {
        setPopups((ps) => ps.filter((p) => p.id !== id));
      }, 850);
    },
    [],
  );

  const flashCombo = useCallback((step: number) => {
    setComboBanner(step);
    setTimeout(() => {
      setComboBanner((cur) => (cur === step ? 0 : cur));
    }, 700);
  }, []);

  const cascade = useCallback(
    (b0: Board): Promise<Board> => {
      return new Promise((resolve) => {
        let b = b0;
        let combo = 0;
        const step = () => {
          const runs = findRuns(b);
          if (runs.length === 0) {
            resolve(b);
            return;
          }
          combo++;
          if (combo === 1) Sfx.match();
          else Sfx.bigMatch();
          if (combo >= 2) flashCombo(combo);

          const { clear, upgrades } = resolveClears(b, runs);

          // Apply: clear marked cells, upgrade spawn cells. Build new
          // board immutably so React notices the change.
          const next: Board = b.map((row) => row.map((c) => ({ ...c })));
          for (const k of clear) {
            const [r, c] = k.split(",").map(Number);
            next[r][c] = { g: -1 };
          }
          for (const u of upgrades) {
            next[u.r][u.c] = { g: u.gem, sp: u.sp };
          }

          // Score: base per cleared cell, multiplied by combo step,
          // plus a flat bonus per power gem created.
          const baseEarned = clear.size * 10 * combo;
          const powerEarned = upgrades.reduce(
            (s, u) => s + POWER_BONUS[u.sp],
            0,
          );
          setScore((s) => s + baseEarned + powerEarned);

          // Floating popups: one centred over the run for the base
          // earn, plus one per power gem created with its bonus.
          if (runs.length > 0) {
            // Pick a representative cell from the largest run for
            // the score popup so it lands somewhere meaningful.
            const biggest = runs.reduce((a, c) =>
              c.cells.length > a.cells.length ? c : a,
            );
            const mid = biggest.cells[Math.floor(biggest.cells.length / 2)];
            addPopup(mid[0], mid[1], `+${baseEarned}`);
          }
          for (const u of upgrades) {
            addPopup(
              u.r,
              u.c,
              u.sp === "bomb" ? `BOMB +${POWER_BONUS.bomb}` : `+${POWER_BONUS[u.sp]}`,
              "power",
            );
          }

          setBoard(next);
          setTimeout(() => {
            b = gravityAndRefill(next);
            setBoard(b);
            setTimeout(step, 200);
          }, 240);
        };
        setTimeout(step, 50);
      });
    },
    [flashCombo, addPopup],
  );

  const swap = async (a: [number, number], b: [number, number]) => {
    if (busy) return;
    if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) !== 1) return;
    setBusy(true);
    const next: Board = board.map((row) => row.map((c) => ({ ...c })));
    [next[a[0]][a[1]], next[b[0]][b[1]]] = [next[b[0]][b[1]], next[a[0]][a[1]]];
    setBoard(next);
    Sfx.move();
    if (findRuns(next).length === 0) {
      // illegal; swap back
      Sfx.error();
      setTimeout(() => {
        setBoard((prev) => {
          const r: Board = prev.map((row) => row.map((c) => ({ ...c })));
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
    setComboBanner(0);
    setPopups([]);
  };

  const start = () => {
    setStarted(true);
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#1a0a2a] to-[#0b0d12] p-2 sm:p-3 select-none">
      <div className="shrink-0 flex items-center justify-center gap-2 mb-2 text-white text-xs sm:text-sm">
        <SoundToggle />
        <span className="px-3 py-1 rounded-lg bg-white/10">
          💎 <b>{score}</b>
        </span>
        <span className="px-3 py-1 rounded-lg bg-white/10">
          🔄 <b>{moves}</b>
        </span>
        {best > 0 && (
          <span className="px-3 py-1 rounded-lg bg-amber-500/15 border border-amber-400/30 text-amber-200">
            🏆 best <b>{best}</b>
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 w-full flex items-center justify-center">
        <div
          className="relative grid gap-1.5 p-2 rounded-2xl bg-black/40 border border-white/10 h-full max-w-full"
          style={{
            gridTemplateColumns: `repeat(${SIZE}, 1fr)`,
            gridTemplateRows: `repeat(${SIZE}, 1fr)`,
            aspectRatio: "1",
          }}
        >
          {board.map((row, r) =>
            row.map((cell, c) => {
              const isSel = sel && sel[0] === r && sel[1] === c;
              const empty = cell.g === -1;
              const power = cell.sp;
              return (
                <button
                  key={`${r}-${c}`}
                  onClick={() => click(r, c)}
                  className={`relative rounded-lg flex items-center justify-center text-xl sm:text-3xl transition-all overflow-hidden ${
                    empty
                      ? "bg-transparent"
                      : isSel
                        ? "bg-[var(--accent)] scale-110 z-10 ring-2 ring-white/40"
                        : power
                          ? "bg-amber-400/15 hover:bg-amber-400/25 ring-1 ring-amber-300/40"
                          : "bg-white/5 hover:bg-white/10"
                  }`}
                >
                  {!empty && (
                    <>
                      {/* Striped overlays for row/col power gems */}
                      {power === "row" && (
                        <div className="absolute inset-0 pointer-events-none bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.18)_0_3px,transparent_3px_8px)]" />
                      )}
                      {power === "col" && (
                        <div className="absolute inset-0 pointer-events-none bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.18)_0_3px,transparent_3px_8px)]" />
                      )}
                      <span
                        className={
                          power === "bomb"
                            ? "relative drop-shadow-[0_0_8px_rgba(251,191,36,0.9)] animate-pulse"
                            : "relative"
                        }
                      >
                        {power === "bomb" ? "✨" : GEMS[cell.g]}
                      </span>
                      {power === "bomb" && (
                        <span className="absolute bottom-0.5 right-0.5 text-[8px] sm:text-[10px] font-black text-amber-200 leading-none">
                          {GEMS[cell.g]}
                        </span>
                      )}
                    </>
                  )}
                </button>
              );
            }),
          )}
          {/* Floating score popups, positioned with grid coords */}
          {popups.map((p) => (
            <div
              key={p.id}
              className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 font-black text-sm sm:text-lg animate-match3-popup"
              style={{
                left: `${((p.c + 0.5) / SIZE) * 100}%`,
                top: `${((p.r + 0.5) / SIZE) * 100}%`,
                color:
                  p.tone === "power"
                    ? "rgb(252, 211, 77)"
                    : "rgb(167, 243, 208)",
                textShadow: "0 0 8px rgba(0,0,0,0.8)",
              }}
            >
              {p.text}
            </div>
          ))}
          {/* Combo banner — flashes briefly per cascade step */}
          {comboBanner >= 2 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-30">
              <div
                key={comboBanner}
                className="text-3xl sm:text-5xl font-black text-white drop-shadow-[0_0_12px_rgba(255,92,174,0.9)] animate-match3-combo"
                style={{
                  background:
                    "linear-gradient(135deg, #ffd166 0%, #ff5cae 50%, #7c5cff 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Combo ×{comboBanner}!
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 mt-2 text-[10px] text-white/55 text-center">
        Match <b>4</b> for a striped clearer · match <b>5</b> for a bomb that
        clears every gem of its colour
      </div>

      {!started && !over && (
        <GameOverlay
          icon="💎"
          title="Gem Match"
          subtitle={
            <>
              <b>{MOVES} moves</b> to score as high as you can. Match 4 spawns a
              striped clearer; match 5 drops a colour bomb. Cascading combos
              multiply your score.
            </>
          }
          primary={{ label: "▶ Play", onClick: start }}
        />
      )}
      {over && (
        <GameOverlay
          icon="🏆"
          title="Round complete!"
          subtitle={
            <>
              Score <b>{score}</b>
              {score >= best && score > 0 ? (
                <> · 🏆 new best!</>
              ) : best > 0 ? (
                <> · best {best}</>
              ) : null}
            </>
          }
          primary={{ label: "Play again", onClick: reset }}
        >
          <ScoreStatus gameSlug="match-three" status={submitStatus} />
        </GameOverlay>
      )}
    </div>
  );
}
