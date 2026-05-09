"use client";

import { useEffect, useState } from "react";

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

  const flip = (id: number) => {
    if (busy) return;
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
  };

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#0a1f2a] to-[#0b1a35] p-4">
      <div className="flex items-center gap-3 mb-3 text-white text-sm">
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

      <div
        className="grid grid-cols-4 gap-3"
        style={{ width: "min(70vh, 92vw, 480px)" }}
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

      {allMatched && (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center">
          <div className="text-4xl font-black text-white mb-2">🎉 You won!</div>
          <div className="text-white/80 mb-4">in {moves} moves</div>
          <button
            onClick={reset}
            className="px-6 py-3 rounded-lg bg-white text-black font-bold hover:scale-105 transition-transform"
          >
            Play again
          </button>
        </div>
      )}
    </div>
  );
}
