"use client";

import Link from "next/link";

// Skribbl is a multiplayer-only game; the single-game-page just points
// players at the multiplayer lobby.
export default function SkribblStub() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-purple-600 via-pink-500 to-yellow-400 p-8 text-center text-white">
      <div className="text-7xl mb-4">🎨</div>
      <h2 className="text-3xl font-black mb-2 drop-shadow-lg">Skribbl is multiplayer only</h2>
      <p className="text-white/85 max-w-sm mb-6">
        Hop into the lobby, create or join a room with a 6-character code,
        and play in real time with friends.
      </p>
      <Link
        href="/multiplayer/skribbl"
        className="px-6 py-3 rounded-xl bg-white text-black font-bold hover:scale-105 transition-transform shadow-2xl"
      >
        Open multiplayer lobby →
      </Link>
    </div>
  );
}
