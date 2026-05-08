"use client";

import { useEffect, useRef, useState } from "react";
import type { Game } from "@/lib/types";
import { recordPlay } from "@/lib/recentlyPlayed";
import { CUSTOM_GAMES } from "@/games/registry";
import { GameArt } from "./GameArt";

export function GameFrame({ game }: { game: Game }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (started) recordPlay(game.slug);
  }, [started, game.slug]);

  const requestFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setFullscreen(false);
      } else {
        await el.requestFullscreen();
        setFullscreen(true);
      }
    } catch {
      // Fullscreen API can fail on some browsers / iframes; non-fatal
    }
  };

  const CustomGame = CUSTOM_GAMES[game.slug];

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden border border-[var(--border)] shadow-md"
    >
      {!started ? (
        <button
          type="button"
          onClick={() => setStarted(true)}
          className="absolute inset-0 group"
          style={{ background: game.gradient }}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <GameArt icon={game.icon} glyph={game.glyph} size="hero" />
            <div className="w-20 h-20 rounded-full bg-white text-black flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 ml-1">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <div className="text-white text-xl font-bold drop-shadow-lg">
              Click to play {game.title}
            </div>
          </div>
        </button>
      ) : game.source === "embed" && game.url ? (
        <iframe
          src={game.url}
          title={game.title}
          className="absolute inset-0 w-full h-full"
          allow="autoplay; fullscreen; gamepad; accelerometer; gyroscope"
          sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-popups allow-forms"
          referrerPolicy="no-referrer"
        />
      ) : CustomGame ? (
        <div className="absolute inset-0">
          <CustomGame />
        </div>
      ) : (
        <ComingSoon game={game} />
      )}

      {started && (
        <button
          type="button"
          onClick={requestFullscreen}
          className="absolute top-3 right-3 w-10 h-10 rounded-lg bg-black/60 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white hover:bg-black/80 transition-colors z-10"
          title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
            {fullscreen ? (
              <path d="M9 9H4M9 9V4M15 9h5M15 9V4M9 15H4M9 15v5M15 15h5M15 15v5" strokeLinecap="round" />
            ) : (
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" strokeLinecap="round" />
            )}
          </svg>
        </button>
      )}
    </div>
  );
}

function ComingSoon({ game }: { game: Game }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center text-center p-8"
      style={{ background: game.gradient }}
    >
      <div className="text-8xl mb-6 drop-shadow-2xl">{game.glyph}</div>
      <h2 className="text-3xl font-black text-white mb-3 drop-shadow-lg">
        {game.title}
      </h2>
      <p className="text-white/80 max-w-md mb-6">Coming soon!</p>
    </div>
  );
}
