"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { GameOverlay } from "@/components/games/GameOverlay";
import { ScoreStatus } from "@/components/ScoreStatus";
import { SoundToggle } from "@/components/SoundToggle";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { Sfx } from "@/lib/sound";

type Pegs = number[][];

const COLORS = [
  "#7c5cff",
  "#ff5cae",
  "#facc15",
  "#16a34a",
  "#06b6d4",
  "#f97316",
  "#ef4444",
  "#a855f7",
];

function initialPegs(disks: number): Pegs {
  return [Array.from({ length: disks }, (_, i) => disks - i), [], []];
}

function findDisk(disk: number, pegs: Pegs): { peg: number; slot: number } {
  for (let p = 0; p < 3; p++) {
    const idx = pegs[p].indexOf(disk);
    if (idx >= 0) return { peg: p, slot: idx };
  }
  return { peg: 0, slot: 0 };
}

/** Score formula: rewards solving with fewer moves and faster time at
 *  higher difficulty. An optimal solve at 1.5s/move is the baseline.
 *  Using undo cuts the score in half so it stays a real cost. */
function calcScore(
  disks: number,
  moves: number,
  time: number,
  usedUndo: boolean,
): number {
  const minMoves = (1 << disks) - 1;
  const efficiency = minMoves / Math.max(moves, 1);
  const expectedTime = Math.max(15, minMoves * 1.5);
  const overTime = Math.max(0, time - expectedTime);
  const timeFactor = Math.max(0.4, 1 - (overTime / expectedTime) * 0.4);
  const undoMul = usedUndo ? 0.5 : 1;
  return Math.round(100 * disks * efficiency * timeFactor * undoMul);
}

function calcStars(
  disks: number,
  moves: number,
  usedUndo: boolean,
): 0 | 1 | 2 | 3 {
  const minMoves = (1 << disks) - 1;
  if (moves === minMoves && !usedUndo) return 3;
  if (moves <= minMoves * 1.25 && !usedUndo) return 2;
  return 1;
}

type BestRecord = { moves: number; time: number; score: number };

export default function TowerOfHanoi() {
  const [disks, setDisks] = useState(5);
  const initial = useMemo(() => initialPegs(disks), [disks]);
  const [pegs, setPegs] = useState<Pegs>(initial);
  const [sel, setSel] = useState<number | null>(null);
  const [moves, setMoves] = useState(0);
  const [time, setTime] = useState(0);
  const [started, setStarted] = useState(false);
  /** Undo history of (from, to) peg pairs. Each click that performs a
   *  legal move pushes onto this; undo pops and reverses. */
  const [history, setHistory] = useState<{ from: number; to: number }[]>([]);
  const [usedUndo, setUsedUndo] = useState(false);
  const [best, setBest] = useState<BestRecord | null>(null);

  const minMoves = (1 << disks) - 1;
  const won = pegs[2].length === disks && started;
  const score = won ? calcScore(disks, moves, time, usedUndo) : 0;
  const stars = won ? calcStars(disks, moves, usedUndo) : 0;
  const bestKey = `nexplay:hanoi-best-${disks}`;

  const submitStatus = useSubmitScoreOnGameOver(
    "tower-of-hanoi",
    score,
    won,
  );

  // Reset state when disk count changes (also fires on first mount).
  useEffect(() => {
    setPegs(initial);
    setSel(null);
    setMoves(0);
    setTime(0);
    setStarted(false);
    setHistory([]);
    setUsedUndo(false);
  }, [initial]);

  // Load per-difficulty best on mount or when disks changes.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(bestKey);
      setBest(raw ? (JSON.parse(raw) as BestRecord) : null);
    } catch {
      setBest(null);
    }
  }, [bestKey]);

  // Tick clock while playing.
  useEffect(() => {
    if (won || !started) return;
    const id = setInterval(() => setTime((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [won, started]);

  // Persist best on win if we beat it.
  useEffect(() => {
    if (!won) return;
    Sfx.win();
    if (!best || score > best.score) {
      const next: BestRecord = { moves, time, score };
      setBest(next);
      try {
        localStorage.setItem(bestKey, JSON.stringify(next));
      } catch {
        // private mode — best is nice-to-have
      }
    }
    // Only run on transition to won; subsequent score/best changes
    // shouldn't re-fire the "Sfx.win" cue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [won]);

  // Measure board so disks can size in pixels (responsive across
  // embed and fullscreen).
  const boardRef = useRef<HTMLDivElement>(null);
  const [boardSize, setBoardSize] = useState({ w: 600, h: 360 });
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setBoardSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const click = (i: number) => {
    if (won || !started) return;
    if (sel === null) {
      if (pegs[i].length === 0) return;
      setSel(i);
      Sfx.click();
      return;
    }
    if (sel === i) {
      setSel(null);
      Sfx.click();
      return;
    }
    const from = pegs[sel];
    const to = pegs[i];
    const top = from[from.length - 1];
    const dest = to[to.length - 1];
    if (dest !== undefined && top > dest) {
      setSel(null);
      Sfx.error();
      return;
    }
    const next: Pegs = [pegs[0].slice(), pegs[1].slice(), pegs[2].slice()];
    next[i].push(next[sel].pop()!);
    setPegs(next);
    setHistory((h) => [...h, { from: sel, to: i }]);
    setMoves((m) => m + 1);
    setSel(null);
    Sfx.thud();
  };

  const undo = useCallback(() => {
    if (won || !started) return;
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setPegs((cur) => {
      const next: Pegs = [cur[0].slice(), cur[1].slice(), cur[2].slice()];
      const disk = next[last.to].pop();
      if (disk !== undefined) next[last.from].push(disk);
      return next;
    });
    setHistory((h) => h.slice(0, -1));
    setMoves((m) => Math.max(0, m - 1));
    setUsedUndo(true);
    setSel(null);
    Sfx.click();
  }, [history, won, started]);

  const reset = () => {
    setPegs(initialPegs(disks));
    setSel(null);
    setMoves(0);
    setTime(0);
    setStarted(false);
    setHistory([]);
    setUsedUndo(false);
  };

  // Disk geometry — derived from measured board size so disks scale
  // with the container instead of with the viewport.
  const pegBaseY = 36; // px from board bottom — leaves room for the base bar
  const lift = 28; // px lifted when its peg is selected
  const diskGap = 2;
  // Reserve room for an extra "lifted" slot above the tallest stack
  // so a fully selected peg doesn't push the lifted disk off the top.
  const diskH = Math.max(
    10,
    Math.min(22, (boardSize.h - pegBaseY - lift - 16) / (disks + 1)),
  );

  // Each peg occupies one third of the board horizontally; centre
  // the disk on its peg with translate(-50%).
  const pegCenterPct = (i: number) => ((i + 0.5) / 3) * 100;

  // Disk widths — smallest 8% of board, largest ~28% so they always
  // fit comfortably within their peg's third.
  const diskWidthPct = (d: number) =>
    disks <= 1 ? 28 : 8 + ((d - 1) / (disks - 1)) * 20;

  const allDisks = useMemo(
    () => Array.from({ length: disks }, (_, i) => i + 1),
    [disks],
  );

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#0a1a14] to-[#0b0d12] p-2 sm:p-3 select-none">
      {/* HUD */}
      <div className="shrink-0 flex items-center justify-center gap-2 mb-2 text-white text-xs sm:text-sm flex-wrap">
        <span className="px-2.5 py-1 rounded-lg bg-white/10">
          🎯 <b>{moves}</b> moves
        </span>
        <span className="px-2.5 py-1 rounded-lg bg-white/10">
          ⏱️ <b>{time}s</b>
        </span>
        <span className="px-2.5 py-1 rounded-lg bg-white/10">
          ⚡ Min <b>{minMoves}</b>
        </span>
        {best && (
          <span
            className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-400/30 text-amber-200"
            title={`Best at ${disks} disks`}
          >
            🏆 <b>{best.score}</b>
          </span>
        )}
        <button
          onClick={undo}
          disabled={!started || won || history.length === 0}
          className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:hover:bg-white/10 font-bold transition-colors"
          title="Undo last move (uses cuts your score in half)"
        >
          ↶ Undo
        </button>
        <button
          onClick={reset}
          disabled={!started}
          className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:hover:bg-white/10 font-bold transition-colors"
        >
          ↻ Reset
        </button>
        <SoundToggle />
        <select
          value={disks}
          onChange={(e) => setDisks(parseInt(e.target.value, 10))}
          className="px-2 py-1 rounded-lg bg-white/10 text-white text-xs"
        >
          {[3, 4, 5, 6, 7].map((n) => (
            <option key={n} value={n}>
              {n} disks
            </option>
          ))}
        </select>
      </div>

      {/* Board */}
      <div className="flex-1 min-h-0 w-full flex items-center justify-center">
        <div
          ref={boardRef}
          className="relative w-full h-full max-w-[820px] rounded-2xl bg-black/30 border border-white/10 overflow-hidden"
        >
          {/* Peg zones: invisible click targets + visible pole + base */}
          {[0, 1, 2].map((i) => {
            const isSel = sel === i;
            return (
              <button
                key={i}
                onClick={() => click(i)}
                aria-label={`Peg ${i + 1}`}
                className={`absolute top-0 bottom-0 transition-colors ${
                  isSel
                    ? "bg-[var(--accent)]/10 ring-2 ring-[var(--accent)]/60"
                    : "hover:bg-white/5"
                }`}
                style={{
                  left: `${(i / 3) * 100}%`,
                  width: `${100 / 3}%`,
                }}
              >
                {/* Pole */}
                <div
                  className="absolute left-1/2 -translate-x-1/2 rounded-t-md bg-white/25"
                  style={{
                    bottom: `${pegBaseY}px`,
                    width: 6,
                    height: `calc(100% - ${pegBaseY + 12}px)`,
                  }}
                />
                {/* Base */}
                <div
                  className="absolute left-[8%] right-[8%] rounded-md bg-white/30"
                  style={{ bottom: `${pegBaseY - 14}px`, height: 10 }}
                />
              </button>
            );
          })}

          {/* Disks — single absolute layer so they animate smoothly
           *  between pegs via CSS transitions on left/bottom. */}
          {allDisks.map((diskId) => {
            const { peg, slot } = findDisk(diskId, pegs);
            const isTop = pegs[peg][pegs[peg].length - 1] === diskId;
            const isLifted = sel === peg && isTop;
            const liftPx = isLifted ? lift : 0;
            const bottomPx =
              pegBaseY + slot * (diskH + diskGap) + liftPx;
            return (
              <div
                key={diskId}
                className="absolute pointer-events-none rounded-md"
                style={{
                  left: `${pegCenterPct(peg)}%`,
                  bottom: `${bottomPx}px`,
                  width: `${diskWidthPct(diskId)}%`,
                  height: `${diskH}px`,
                  transform: "translateX(-50%)",
                  background: COLORS[(diskId - 1) % COLORS.length],
                  boxShadow:
                    "inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -2px 0 rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.4)",
                  transition:
                    "left 0.32s cubic-bezier(0.4, 0.1, 0.3, 1), bottom 0.28s cubic-bezier(0.4, 0.1, 0.3, 1)",
                }}
              />
            );
          })}
        </div>
      </div>

      <div className="shrink-0 mt-2 text-[10px] text-white/55 text-center">
        Tap a peg to pick its top disk, tap another to drop it. Bigger never
        on smaller. {minMoves} moves is optimal.
      </div>

      {!started && !won && (
        <GameOverlay
          icon="🗼"
          title="Tower of Hanoi"
          subtitle={
            <>
              Move all <b>{disks} disks</b> to the right peg. Optimal solve is{" "}
              <b>{minMoves} moves</b>. Bigger disks can never sit on smaller
              ones.
            </>
          }
          primary={{ label: "▶ Play", onClick: () => setStarted(true) }}
        />
      )}
      {won && (
        <GameOverlay
          icon={stars === 3 ? "🏆" : stars === 2 ? "🥈" : "✨"}
          title="Solved!"
          subtitle={
            <>
              <b>{moves}</b> moves · <b>{time}s</b> · min was <b>{minMoves}</b>
              {usedUndo && (
                <>
                  {" "}
                  · <span className="text-amber-300">undo used</span>
                </>
              )}
            </>
          }
          primary={{ label: "Play again", onClick: reset }}
        >
          {/* Star rating */}
          <div
            className="flex items-center justify-center gap-1 text-3xl"
            aria-label={`${stars} of 3 stars`}
          >
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                className={
                  n <= stars
                    ? "text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.7)]"
                    : "text-white/15"
                }
              >
                ★
              </span>
            ))}
          </div>
          <div className="text-2xl font-black text-emerald-400">
            +{score}
          </div>
          {moves === minMoves && !usedUndo && (
            <div className="text-yellow-400 font-bold text-sm">
              ⭐ Perfect run!
            </div>
          )}
          {best && score >= best.score && score > 0 && (
            <div className="text-amber-300 font-bold text-sm">
              🏆 New personal best for {disks} disks!
            </div>
          )}
          <ScoreStatus
            gameSlug="tower-of-hanoi"
            status={submitStatus}
          />
        </GameOverlay>
      )}
    </div>
  );
}
