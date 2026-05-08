"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

const Loading = () => (
  <div className="absolute inset-0 flex items-center justify-center text-white text-sm bg-black/60">
    Loading game…
  </div>
);

export const CUSTOM_GAMES: Record<string, ComponentType> = {
  "tic-tac-toe": dynamic(() => import("./tic-tac-toe/Game"), {
    ssr: false,
    loading: Loading,
  }),
  snake: dynamic(() => import("./snake/Game"), {
    ssr: false,
    loading: Loading,
  }),
  "2048": dynamic(() => import("./2048/Game"), {
    ssr: false,
    loading: Loading,
  }),
  "connect-four": dynamic(() => import("./connect-four/Game"), {
    ssr: false,
    loading: Loading,
  }),
  pong: dynamic(() => import("./pong/Game"), {
    ssr: false,
    loading: Loading,
  }),
  "memory-match": dynamic(() => import("./memory-match/Game"), {
    ssr: false,
    loading: Loading,
  }),
  flappy: dynamic(() => import("./flappy/Game"), {
    ssr: false,
    loading: Loading,
  }),
  checkers: dynamic(() => import("./checkers/Game"), {
    ssr: false,
    loading: Loading,
  }),
  "drift-king": dynamic(() => import("./drift-king/Game"), {
    ssr: false,
    loading: Loading,
  }),
  "neon-runner": dynamic(() => import("./neon-runner/Game"), {
    ssr: false,
    loading: Loading,
  }),
  "treasure-hunt": dynamic(() => import("./treasure-hunt/Game"), {
    ssr: false,
    loading: Loading,
  }),
  tetris: dynamic(() => import("./tetris/Game"), {
    ssr: false,
    loading: Loading,
  }),
  minesweeper: dynamic(() => import("./minesweeper/Game"), {
    ssr: false,
    loading: Loading,
  }),
  breakout: dynamic(() => import("./breakout/Game"), {
    ssr: false,
    loading: Loading,
  }),
  asteroids: dynamic(() => import("./asteroids/Game"), {
    ssr: false,
    loading: Loading,
  }),
  "whack-a-mole": dynamic(() => import("./whack-a-mole/Game"), {
    ssr: false,
    loading: Loading,
  }),
};
