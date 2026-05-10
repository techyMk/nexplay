"use client";

import { useEffect, useMemo, useState } from "react";
import { GameOverlay } from "@/components/games/GameOverlay";

type Pegs = number[][];

function initialPegs(disks: number): Pegs {
  return [Array.from({ length: disks }, (_, i) => disks - i), [], []];
}

const COLORS = ["#7c5cff", "#ff5cae", "#facc15", "#16a34a", "#06b6d4", "#f97316", "#ef4444", "#a855f7"];

export default function TowerOfHanoi() {
  const [disks, setDisks] = useState(5);
  const initial = useMemo(() => initialPegs(disks), [disks]);
  const [pegs, setPegs] = useState<Pegs>(initial);
  const [sel, setSel] = useState<number | null>(null);
  const [moves, setMoves] = useState(0);
  const [time, setTime] = useState(0);
  const [started, setStarted] = useState(false);

  const minMoves = (1 << disks) - 1;
  const won = pegs[2].length === disks && started;

  useEffect(() => {
    setPegs(initial);
    setSel(null);
    setMoves(0);
    setTime(0);
    setStarted(false);
  }, [initial]);

  useEffect(() => {
    if (won || !started) return;
    const id = setInterval(() => setTime((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [won, started]);

  const click = (i: number) => {
    if (won || !started) return;
    if (sel === null) {
      if (pegs[i].length === 0) return;
      setSel(i);
      return;
    }
    if (sel === i) {
      setSel(null);
      return;
    }
    const from = pegs[sel];
    const to = pegs[i];
    const top = from[from.length - 1];
    const dest = to[to.length - 1];
    if (dest !== undefined && top > dest) {
      setSel(null);
      return;
    }
    const next: Pegs = [pegs[0].slice(), pegs[1].slice(), pegs[2].slice()];
    next[i].push(next[sel].pop()!);
    setPegs(next);
    setMoves((m) => m + 1);
    setSel(null);
  };

  const reset = () => {
    setPegs(initialPegs(disks));
    setSel(null);
    setMoves(0);
    setTime(0);
    setStarted(false);
  };

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#0a1a14] to-[#0b0d12] p-4 select-none">
      <div className="flex items-center gap-3 mb-3 text-white text-sm flex-wrap justify-center">
        <span className="px-3 py-1 rounded-lg bg-white/10">🎯 {moves} moves</span>
        <span className="px-3 py-1 rounded-lg bg-white/10">⏱️ {time}s</span>
        <span className="px-3 py-1 rounded-lg bg-white/10">⚡ Min: {minMoves}</span>
        <select
          value={disks}
          onChange={(e) => setDisks(parseInt(e.target.value, 10))}
          className="px-3 py-1 rounded-lg bg-white/10 text-white text-xs"
        >
          {[3, 4, 5, 6, 7].map((n) => (
            <option key={n} value={n}>{n} disks</option>
          ))}
        </select>
      </div>

      <div
        className="flex items-end justify-around gap-4 p-4 rounded-2xl bg-black/30"
        style={{ width: "min(95vw, 720px)", height: "min(60vh, 420px)" }}
      >
        {[0, 1, 2].map((i) => (
          <button
            key={i}
            onClick={() => click(i)}
            className={`relative flex-1 h-full flex flex-col-reverse items-center justify-start gap-1 rounded-xl border-2 transition-colors px-2 pt-2 pb-3 ${
              sel === i ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-white/10 hover:border-white/30"
            }`}
          >
            {/* Pole */}
            <div
              className="absolute left-1/2 -translate-x-1/2 bottom-3 rounded-t-md bg-white/30"
              style={{ width: 6, height: "85%" }}
            />
            {/* Base */}
            <div className="w-full h-3 rounded-md bg-white/30" />
            {/* Disks */}
            <div className="relative w-full flex flex-col-reverse items-center gap-0.5">
              {pegs[i].map((d, j) => (
                <div
                  key={j}
                  className="rounded-md transition-all"
                  style={{
                    width: `${20 + d * 10}%`,
                    height: 16,
                    background: COLORS[(d - 1) % COLORS.length],
                    boxShadow:
                      "inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -2px 0 rgba(0,0,0,0.3)",
                  }}
                />
              ))}
            </div>
          </button>
        ))}
      </div>

      <div className="mt-3 text-xs text-white/60">
        Move all disks to the right peg. Bigger never on smaller.
      </div>
      <button
        onClick={reset}
        className="mt-2 px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold"
      >
        Reset
      </button>

      {!started && !won && (
        <GameOverlay
          icon="🗼"
          title="Tower of Hanoi"
          subtitle={`Move all ${disks} disks to the right peg. Bigger disks never go on smaller. Minimum: ${minMoves} moves.`}
          primary={{ label: "▶ Play", onClick: () => setStarted(true) }}
        />
      )}
      {won && (
        <GameOverlay
          icon="🏆"
          title="Solved!"
          subtitle={`${moves} moves · ${time}s · min was ${minMoves}`}
          primary={{ label: "Play again", onClick: reset }}
        >
          {moves === minMoves && (
            <div className="text-yellow-400 font-bold">⭐ Perfect run!</div>
          )}
        </GameOverlay>
      )}
    </div>
  );
}
