"use client";

import { useEffect, useMemo, useState } from "react";
import { GameOverlay } from "@/components/games/GameOverlay";
import { ScoreStatus } from "@/components/ScoreStatus";
import { SoundToggle } from "@/components/SoundToggle";
import { Sfx } from "@/lib/sound";
import { useSubmitScoreOnGameOver } from "@/lib/scores";

/** Base score per difficulty — what you earn for a perfect run.
 *  Higher difficulties carry more points so the leaderboard naturally
 *  rewards bigger boards. */
const DIFFICULTY_BASE: Record<"easy" | "medium" | "hard", number> = {
  easy: 400,
  medium: 800,
  hard: 1500,
};
/** Score penalty per wasted move (every move past the optimal count). */
const PENALTY_PER_EXTRA_MOVE = 20;

function scoreForRun(
  diff: "easy" | "medium" | "hard",
  totalPairs: number,
  moves: number,
): number {
  const extra = Math.max(0, moves - totalPairs);
  const base = DIFFICULTY_BASE[diff];
  return Math.max(50, base - extra * PENALTY_PER_EXTRA_MOVE);
}

type Difficulty = "easy" | "medium" | "hard";
type CategoryKey = "animals" | "food" | "travel" | "sports" | "nature" | "mixed";

type GridShape = { cols: number; rows: number };
const DIFFICULTY_GRID: Record<Difficulty, GridShape> = {
  easy: { cols: 4, rows: 3 }, // 12 cards · 6 pairs
  medium: { cols: 4, rows: 4 }, // 16 cards · 8 pairs
  hard: { cols: 6, rows: 4 }, // 24 cards · 12 pairs
};

const CATEGORIES: Record<
  CategoryKey,
  { label: string; chip: string; pool: string[] }
> = {
  animals: {
    label: "Animals",
    chip: "🐼",
    pool: [
      "🐶","🐱","🦁","🐼","🐯","🐨","🐰","🦊",
      "🐸","🦉","🐢","🦋","🐙","🦄","🐝","🦒",
    ],
  },
  food: {
    label: "Food",
    chip: "🍕",
    pool: [
      "🍕","🍔","🍟","🌭","🍿","🥨","🧀","🍩",
      "🍪","🎂","🍓","🍑","🥑","🌽","🍇","🥝",
    ],
  },
  travel: {
    label: "Travel",
    chip: "✈️",
    pool: [
      "✈️","🚀","🚂","🚗","🚲","⛵","🏖️","🗽",
      "🗼","🎡","🎢","🏰","⛺","🚁","🚢","🏔️",
    ],
  },
  sports: {
    label: "Sports",
    chip: "⚽",
    pool: [
      "⚽","🏀","🏈","⚾","🎾","🏐","🏓","🥊",
      "🏆","🥇","🏊","🚴","🏌️","⛷️","🏇","🎯",
    ],
  },
  nature: {
    label: "Nature",
    chip: "🌸",
    pool: [
      "🌸","🌻","🌹","🍁","🌳","🌴","🌲","🌵",
      "🍀","🌿","🌾","🌷","🌺","🌼","🍄","🪴",
    ],
  },
  mixed: {
    label: "Mixed",
    chip: "🎲",
    pool: [
      "🎮","🚀","🎯","🎲","🎨","🏆","⚡","🌟",
      "🎵","🎂","🎁","🎈","🎃","💎","🔥","🌈",
    ],
  },
};

type Card = { id: number; emoji: string; flipped: boolean; matched: boolean };

function buildDeck(category: CategoryKey, pairCount: number): Card[] {
  const pool = CATEGORIES[category].pool;
  const picked = pool.slice(0, pairCount);
  const pairs = [...picked, ...picked];
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  return pairs.map((emoji, id) => ({
    id,
    emoji,
    flipped: false,
    matched: false,
  }));
}

export default function MemoryMatch() {
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [category, setCategory] = useState<CategoryKey>("mixed");
  const grid = DIFFICULTY_GRID[difficulty];
  const totalPairs = (grid.cols * grid.rows) / 2;
  const [cards, setCards] = useState<Card[]>(() =>
    buildDeck("mixed", DIFFICULTY_GRID.medium.cols * DIFFICULTY_GRID.medium.rows / 2),
  );
  const [first, setFirst] = useState<number | null>(null);
  const [second, setSecond] = useState<number | null>(null);
  const [moves, setMoves] = useState(0);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);

  const matchedPairs = useMemo(
    () => cards.filter((c) => c.matched).length / 2,
    [cards],
  );
  const allMatched = started && matchedPairs === totalPairs && totalPairs > 0;
  const finalScore = allMatched
    ? scoreForRun(difficulty, totalPairs, moves)
    : 0;
  const submitStatus = useSubmitScoreOnGameOver(
    "memory-match",
    finalScore,
    allMatched,
  );
  const [best, setBest] = useState(0);
  const bestKey = `nexplay:memory-match-best-${difficulty}`;
  useEffect(() => {
    setBest(Number(localStorage.getItem(bestKey) || 0));
  }, [bestKey]);
  useEffect(() => {
    if (!allMatched) return;
    Sfx.win();
    if (finalScore <= best) return;
    setBest(finalScore);
    try {
      localStorage.setItem(bestKey, String(finalScore));
    } catch {
      // private mode — best is nice-to-have
    }
  }, [allMatched, finalScore, best, bestKey]);

  const flip = (id: number) => {
    if (busy || !started) return;
    const card = cards.find((c) => c.id === id);
    if (!card || card.flipped || card.matched) return;
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, flipped: true } : c)));
    Sfx.click();
    if (first === null) {
      setFirst(id);
    } else if (second === null) {
      setSecond(id);
    }
  };

  useEffect(() => {
    if (first !== null && second !== null) {
      setBusy(true);
      setMoves((m) => m + 1);
      const a = cards.find((c) => c.id === first);
      const b = cards.find((c) => c.id === second);
      if (a && b && a.emoji === b.emoji) {
        Sfx.match();
        setTimeout(() => {
          setCards((cs) =>
            cs.map((c) =>
              c.id === first || c.id === second ? { ...c, matched: true } : c,
            ),
          );
          setFirst(null);
          setSecond(null);
          setBusy(false);
        }, 350);
      } else {
        setTimeout(() => {
          Sfx.error();
          setCards((cs) =>
            cs.map((c) =>
              c.id === first || c.id === second ? { ...c, flipped: false } : c,
            ),
          );
          setFirst(null);
          setSecond(null);
          setBusy(false);
        }, 800);
      }
    }
  }, [first, second, cards]);

  const reset = (
    nextDifficulty: Difficulty = difficulty,
    nextCategory: CategoryKey = category,
  ) => {
    const g = DIFFICULTY_GRID[nextDifficulty];
    setCards(buildDeck(nextCategory, (g.cols * g.rows) / 2));
    setFirst(null);
    setSecond(null);
    setMoves(0);
    setBusy(false);
    setStarted(false);
  };

  const start = () => {
    // Rebuild the deck for the currently-selected difficulty + category
    // so changing the selectors before clicking Play takes effect.
    setCards(buildDeck(category, totalPairs));
    setFirst(null);
    setSecond(null);
    setMoves(0);
    setBusy(false);
    setStarted(true);
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#0a1f2a] to-[#0b1a35] p-2 sm:p-3">
      <div className="shrink-0 flex items-center justify-center gap-2 mb-2 text-white text-xs sm:text-sm flex-wrap">
        <SoundToggle />
        <span className="px-3 py-1 rounded-lg bg-white/10">
          Moves: <b>{moves}</b>
        </span>
        <span className="px-3 py-1 rounded-lg bg-white/10">
          Matched: <b>{matchedPairs}/{totalPairs}</b>
        </span>
        {best > 0 && (
          <span
            className="px-3 py-1 rounded-lg bg-amber-500/15 border border-amber-400/30 text-amber-200"
            title={`Best score on ${difficulty}`}
          >
            🏆 <b>{best}</b>
          </span>
        )}
        <button
          onClick={() => reset()}
          className="px-3 py-1 rounded-lg bg-white text-stone-900 text-xs font-bold hover:scale-105 transition-transform"
        >
          Reset
        </button>
      </div>

      <div className="shrink-0 flex items-center justify-center gap-2 mb-2 text-white text-[11px] flex-wrap">
        <div className="inline-flex rounded-lg bg-white/10 p-0.5">
          {(Object.keys(DIFFICULTY_GRID) as Difficulty[]).map((d) => {
            const g = DIFFICULTY_GRID[d];
            return (
              <button
                key={d}
                onClick={() => {
                  setDifficulty(d);
                  reset(d, category);
                }}
                className={`px-2.5 py-1 rounded-md font-bold transition-colors ${
                  difficulty === d
                    ? "bg-white/20 text-white"
                    : "text-white/60 hover:text-white"
                }`}
                title={`${g.cols}×${g.rows} · ${(g.cols * g.rows) / 2} pairs`}
              >
                <span className="capitalize">{d}</span>
                <span className="opacity-60 ml-1">{g.cols}×{g.rows}</span>
              </button>
            );
          })}
        </div>
        <div className="inline-flex rounded-lg bg-white/10 p-0.5 flex-wrap">
          {(Object.keys(CATEGORIES) as CategoryKey[]).map((c) => (
            <button
              key={c}
              onClick={() => {
                setCategory(c);
                reset(difficulty, c);
              }}
              title={CATEGORIES[c].label}
              className={`px-2 py-1 rounded-md font-bold transition-colors whitespace-nowrap ${
                category === c
                  ? "bg-white/20 text-white"
                  : "text-white/60 hover:text-white"
              }`}
            >
              <span className="sm:mr-1">{CATEGORIES[c].chip}</span>
              <span className="hidden sm:inline">{CATEGORIES[c].label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 w-full flex items-center justify-center">
        <div
          className="grid gap-2 sm:gap-3 h-full max-w-full"
          style={{
            gridTemplateColumns: `repeat(${grid.cols}, 1fr)`,
            gridTemplateRows: `repeat(${grid.rows}, 1fr)`,
            aspectRatio: `${grid.cols} / ${grid.rows}`,
          }}
        >
          {cards.map((c) => {
            const showFace = c.flipped || c.matched;
            // Scale font down for larger grids so emoji always fits.
            const fontSize =
              grid.cols >= 6 ? "text-2xl sm:text-3xl" : "text-4xl md:text-5xl";
            return (
              <button
                key={c.id}
                onClick={() => flip(c.id)}
                className={`aspect-square rounded-xl flex items-center justify-center transition-all ${fontSize}`}
                style={{
                  background: showFace
                    ? c.matched
                      ? "linear-gradient(135deg, #06b6d4, #3b82f6)"
                      : "linear-gradient(135deg, #7c5cff, #ff5cae)"
                    : "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                {showFace ? c.emoji : <span className="text-white/40">?</span>}
              </button>
            );
          })}
        </div>
      </div>

      {!started && !allMatched && (
        <GameOverlay
          icon={CATEGORIES[category].chip}
          title="Memory Match"
          subtitle={
            <>
              {CATEGORIES[category].label} · {grid.cols}×{grid.rows} · {totalPairs} pairs.
              Flip cards to find matching pairs.
            </>
          }
          primary={{ label: "▶ Play", onClick: start }}
        />
      )}
      {allMatched && (
        <GameOverlay
          icon="🎉"
          title="You won!"
          subtitle={
            <>
              <b>{totalPairs}</b> pairs in <b>{moves}</b> moves
              {moves === totalPairs && " · perfect memory!"}
            </>
          }
          primary={{ label: "Play again", onClick: () => reset() }}
        >
          <div className="text-3xl font-black text-emerald-400">
            +{finalScore}
          </div>
          {finalScore >= best && finalScore > 0 && (
            <div className="text-amber-300 font-bold text-sm">
              🏆 New best for {difficulty}!
            </div>
          )}
          <ScoreStatus gameSlug="memory-match" status={submitStatus} />
        </GameOverlay>
      )}
    </div>
  );
}
