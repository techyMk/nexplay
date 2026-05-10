"use client";

import { useEffect, useState } from "react";
import { GameOverlay } from "@/components/games/GameOverlay";

const EMOJIS = ["🎮", "🚀", "🎯", "🎲", "🎨", "🏆", "⚡", "🌟"];

type Card = { id: number; emoji: string; flipped: boolean; matched: boolean };

function shuffle(): Card[] {
  const pairs = [...EMOJIS, ...EMOJIS];
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  return pairs.map((emoji, id) => ({ id, emoji, flipped: false, matched: false }));
}

export default function MemoryMatch() {
  const [cards, setCards] = useState<Card[]>(shuffle);
  const [first, setFirst] = useState<number | null>(null);
  const [second, setSecond] = useState<number | null>(null);
  const [moves, setMoves] = useState(0);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);

  const flip = (id: number) => {
    if (busy || !started) return;
    const card = cards.find((c) => c.id === id);
    if (!card || card.flipped || card.matched) return;
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, flipped: true } : c)));
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
        setTimeout(() => {
          setCards((cs) =>
            cs.map((c) =>
              c.id === first || c.id === second ? { ...c, matched: true } : c,
            ),
          );
          setFirst(null); setSecond(null); setBusy(false);
        }, 350);
      } else {
        setTimeout(() => {
          setCards((cs) =>
            cs.map((c) =>
              c.id === first || c.id === second ? { ...c, flipped: false } : c,
            ),
          );
          setFirst(null); setSecond(null); setBusy(false);
        }, 800);
      }
    }
  }, [first, second, cards]);

  const allMatched = cards.every((c) => c.matched);

  const reset = () => {
    setCards(shuffle());
    setFirst(null); setSecond(null);
    setMoves(0); setBusy(false);
    setStarted(false);
  };

  const start = () => {
    setStarted(true);
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#0a1f2a] to-[#0b1a35] p-2 sm:p-3">
      <div className="shrink-0 flex items-center justify-center gap-2 mb-2 text-white text-xs sm:text-sm flex-wrap">
        <span className="px-3 py-1 rounded-lg bg-white/10">Moves: <b>{moves}</b></span>
        <span className="px-3 py-1 rounded-lg bg-white/10">
          Matched: <b>{cards.filter((c) => c.matched).length / 2}/{EMOJIS.length}</b>
        </span>
        <button
          onClick={reset}
          className="px-3 py-1 rounded-lg bg-white text-black text-xs font-bold hover:scale-105 transition-transform"
        >
          Reset
        </button>
      </div>

      <div className="flex-1 min-h-0 w-full flex items-center justify-center">
      <div
        className="grid grid-cols-4 gap-2 sm:gap-3 h-full max-w-full"
        style={{ aspectRatio: "1" }}
      >
        {cards.map((c) => {
          const showFace = c.flipped || c.matched;
          return (
            <button
              key={c.id}
              onClick={() => flip(c.id)}
              className="aspect-square rounded-xl text-4xl md:text-5xl flex items-center justify-center transition-all"
              style={{
                background: showFace
                  ? c.matched
                    ? "linear-gradient(135deg, #06b6d4, #3b82f6)"
                    : "linear-gradient(135deg, #7c5cff, #ff5cae)"
                  : "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.1)",
                transform: showFace ? "rotateY(0deg)" : "rotateY(0deg)",
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
          icon="🎴"
          title="Memory Match"
          subtitle="Flip cards to find matching pairs. Fewer moves is better."
          primary={{ label: "▶ Play", onClick: start }}
        />
      )}
      {allMatched && (
        <GameOverlay
          icon="🎉"
          title="You won!"
          subtitle={`in ${moves} moves`}
          primary={{ label: "Play again", onClick: reset }}
        />
      )}
    </div>
  );
}
