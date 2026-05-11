"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useKeyboard } from "../useGameLoop";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";
import { GameOverlay, PauseToggle } from "@/components/games/GameOverlay";
import { SoundToggle } from "@/components/SoundToggle";
import {
  Sfx,
  createAmbience,
  type Ambience,
  type AmbienceConfig,
} from "@/lib/sound";

const COLS = 20;
const ROWS = 14;
const CELL = 32;
const W = COLS * CELL;
const H = ROWS * CELL;

// Cell values
//   0 = floor       1 = wall      2 = treasure (extracted into array)
//   3 = exit        4 = spike     5 = ice
//
// Treasures are pulled out of the grid on level load so each one
// can carry its own kind / animation state, and the grid keeps just
// the static tiles.
type LevelTheme = {
  /** Display name shown in the HUD and the level-intro overlay. */
  name: string;
  /** Short blurb shown at the top of the level. */
  blurb: string;
  /** Wall fill / floor fill colour pair. */
  wall: string;
  floor: string;
  /** Accent colour for the floor speckle, exit halo, etc. */
  accent: string;
  /** Outer wrapper background gradient — what shows in the page
   *  surround behind the canvas. */
  bgFrom: string;
  bgTo: string;
  /** Canvas-internal backdrop gradient (top → bottom). */
  canvasFrom: string;
  canvasTo: string;
  /** Decoration kind drawn on a sparse subset of wall cells so each
   *  map has its own readable atmosphere. */
  decoration: "torches" | "chains" | "crystals";
  /** How many walls between decorations — bigger = sparser. Torches
   *  glow loudly so they want a bigger gap; chains and crystals are
   *  small/subtle and read fine at a closer interval. */
  decorationEvery: number;
  /** Background drone configuration — handed to createAmbience on
   *  level load. */
  ambience: AmbienceConfig;
  /** When true, *every* walkable tile in this level is treated as
   *  slippery ice for movement friction — including spike tiles, so
   *  spike traps placed on this level become "ice spikes" you slide
   *  into. Used by Frozen Vault to combine both hazards. */
  allFloorIcy?: boolean;
};

type LevelDef = { theme: LevelTheme; grid: number[][] };

const LEVELS: LevelDef[] = [
  // -------------------------------------------------------------
  // Level 1 — The Cavern. Open arena with a few decorative wall
  // pillars. Treasures are placed out in the open along the
  // natural path from spawn (top-left) to exit (bottom-right). No
  // hazards — this level teaches movement + pickups.
  // -------------------------------------------------------------
  {
    theme: {
      name: "The Cavern",
      blurb: "Five glints in the rock. The exit is at the far end.",
      wall: "#2a1f12",
      floor: "#15110a",
      accent: "#facc15",
      bgFrom: "#3a2810",
      bgTo: "#0b0d12",
      canvasFrom: "#1a1208",
      canvasTo: "#040301",
      decoration: "torches",
      // Torches throw big glow pools; one every ~12 walls is plenty
      // for atmosphere without making the screen read as on fire.
      decorationEvery: 12,
      ambience: {
        // Warm low-A drone with a fifth and an octave — sits low so
        // it doesn't fight the pickup chimes.
        notes: [55, 82.4, 110],
        type: "sine",
        volume: 0.04,
        filterFreq: 420,
        modDepth: 90,
        modSpeed: 0.13,
      },
    },
    grid: [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 2, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 2, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 2, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 1, 1, 0, 0, 0, 2, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ],
  },
  // -------------------------------------------------------------
  // Level 2 — Spike Pit Ruins. Same skeleton as Level 1 (same
  // wall layout, same treasure positions) so the player can read
  // the path immediately, plus rhythmic spike traps strewn across
  // the floor. Stepping on an extended spike costs a life. Spikes
  // never fully block a path — every treasure is still reachable
  // along an obvious line, just dangerous.
  // -------------------------------------------------------------
  {
    theme: {
      name: "Spike Pit Ruins",
      blurb:
        "Same map, but the floor's gone hostile. Wait for spikes to drop, then run.",
      wall: "#2e2e3a",
      floor: "#181822",
      accent: "#ef4444",
      bgFrom: "#1f1f2e",
      bgTo: "#0a0a14",
      canvasFrom: "#181828",
      canvasTo: "#080810",
      decoration: "chains",
      decorationEvery: 5,
      ambience: {
        // Darker, dissonant — lower and a minor third for menace,
        // sawtooth roughens the harmonics.
        notes: [49, 58.3, 98],
        type: "sawtooth",
        volume: 0.025,
        filterFreq: 280,
        modDepth: 60,
        modSpeed: 0.09,
      },
    },
    grid: [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 0, 4, 0, 0, 0, 4, 0, 0, 0, 4, 0, 0, 0, 4, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 4, 0, 1, 1, 0, 4, 0, 0, 0, 4, 0, 0, 1, 1, 0, 4, 0, 1],
      [1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 2, 0, 0, 0, 4, 0, 1, 1, 1, 0, 4, 0, 0, 0, 0, 2, 0, 1],
      [1, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 2, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 4, 0, 0, 0, 4, 0, 4, 0, 0, 0, 4, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 1, 1, 0, 0, 0, 2, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1],
      [1, 0, 4, 0, 1, 1, 0, 4, 0, 0, 0, 4, 0, 0, 1, 1, 0, 4, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 3, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ],
  },
  // -------------------------------------------------------------
  // Level 3 — Frozen Vault. The hardest map. Same wall skeleton,
  // *every* walkable tile is icy (allFloorIcy), AND the floor is
  // dotted with spike traps that share the cycle with Level 2.
  // Sliding into a spike costs a heart. Two wraiths roam opposite
  // halves of the map, so you can't just outrun the threat — you
  // have to brake into walls or thread past on cooldown.
  // -------------------------------------------------------------
  {
    theme: {
      name: "Frozen Vault",
      blurb:
        "Ice plus spike traps plus two wraiths. Brake into the walls — you can't stop on a dime.",
      wall: "#1f3a55",
      floor: "#0d2a3a",
      accent: "#22d3ee",
      bgFrom: "#0e2540",
      bgTo: "#02080f",
      canvasFrom: "#0d2a3a",
      canvasTo: "#040c14",
      decoration: "crystals",
      decorationEvery: 6,
      ambience: {
        // Bright, cold pad — A3 + E4 + A4 + C#5 (major triad an
        // octave up). Triangle stays clean; faster filter
        // modulation gives a shimmer.
        notes: [220, 329.6, 440, 554.4],
        type: "triangle",
        volume: 0.035,
        filterFreq: 1200,
        modDepth: 250,
        modSpeed: 0.22,
      },
      allFloorIcy: true,
    },
    grid: [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 1],
      [1, 5, 5, 5, 5, 4, 5, 5, 5, 2, 5, 5, 5, 5, 4, 5, 5, 5, 5, 1],
      [1, 5, 5, 5, 1, 1, 5, 5, 5, 5, 5, 5, 5, 5, 1, 1, 5, 5, 5, 1],
      [1, 5, 5, 5, 1, 1, 5, 5, 5, 4, 5, 5, 5, 5, 1, 1, 5, 5, 5, 1],
      [1, 5, 4, 5, 5, 5, 5, 4, 5, 5, 5, 4, 5, 5, 5, 5, 4, 5, 5, 1],
      [1, 5, 2, 5, 5, 5, 5, 5, 1, 1, 1, 5, 5, 5, 5, 5, 5, 2, 5, 1],
      [1, 5, 5, 5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 4, 5, 5, 5, 5, 1],
      [1, 5, 5, 5, 5, 2, 5, 5, 1, 1, 1, 5, 5, 5, 5, 5, 5, 5, 5, 1],
      [1, 5, 4, 5, 5, 5, 5, 4, 5, 5, 5, 4, 5, 5, 5, 5, 4, 5, 5, 1],
      [1, 5, 5, 5, 1, 1, 5, 5, 5, 2, 5, 5, 5, 5, 1, 1, 5, 5, 5, 1],
      [1, 5, 5, 5, 1, 1, 4, 5, 5, 5, 5, 5, 4, 5, 1, 1, 5, 5, 5, 1],
      [1, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 3, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ],
  },
];

const STARTING_LIVES = 3;
const SPIKE_PERIOD = 2;
const SPIKE_ACTIVE_RATIO = 0.45; // active for 45% of the cycle
const INVULN_SECONDS = 1.0;

type TreasureKind = "coin" | "gem" | "chest";
type Treasure = {
  cx: number;
  cy: number;
  kind: TreasureKind;
  phase: number;
  alive: boolean;
  /** How many *more* times this treasure will respawn at a random
   *  walkable cell after being collected. 0 = single-use. */
  respawnsLeft: number;
};
/** A respawn waiting in the queue for a delay to elapse before it
 *  pops back somewhere else on the map. */
type PendingRespawn = {
  delay: number;
  kind: TreasureKind;
  respawnsLeft: number;
};

/** Per-level respawn budget. The first entry is the count of
 *  *additional* spawns each treasure gets after the initial pickup,
 *  so the totals come out as:
 *    L1 (Cavern):       1 → each treasure appears twice
 *    L2 (Spike Pit):    1 → each treasure appears twice
 *    L3 (Frozen Vault): 2 → each treasure appears three times
 *  Ramping it up on the hardest level rewards the player for
 *  surviving longer. */
const LEVEL_RESPAWNS: number[] = [1, 1, 2];
type CatcherKind = "slime" | "sentinel" | "wraith";
type Catcher = {
  kind: CatcherKind;
  /** Cell-space position (centre of the body, in cells, with sub-cell precision). */
  cx: number;
  cy: number;
  /** Anchor cell — wander targets are chosen within wanderRadius of
   *  this point so the catcher stays roughly in its area instead of
   *  drifting across the whole map. */
  homeX: number;
  homeY: number;
  wanderRadius: number;
  /** Currently-targeted wander cell during patrol mode. Updated
   *  whenever the previous target is reached or the catcher loses
   *  sight of the player. */
  wanderTargetX: number;
  wanderTargetY: number;
  state: "patrol" | "chase";
  speed: number;
  detectRange: number;
  /** Cached path of cell waypoints toward the current goal. */
  path: Array<{ c: number; r: number }>;
  pathCool: number;
  /** When > 0, the catcher stops in place — gives the wandering a
   *  natural "look around" beat instead of pacing nonstop. */
  pauseFor: number;
  walkPhase: number;
  bobPhase: number;
  /** Used to play a one-shot "spotted" sound on patrol→chase. */
  alerted: boolean;
};

const CATCHER_DEFS: Record<
  CatcherKind,
  { speed: number; detectRange: number; label: string }
> = {
  slime: { speed: 2.6, detectRange: 5, label: "cave slime" },
  sentinel: { speed: 3.4, detectRange: 6, label: "stone sentinel" },
  wraith: { speed: 3.0, detectRange: 5, label: "frost wraith" },
};

type CatcherSpawn = {
  kind: CatcherKind;
  homeX: number;
  homeY: number;
  /** Max distance from home when picking a random wander target.
   *  Bigger = catcher roams a larger area. Defaults to 4. */
  wanderRadius?: number;
};

/** Catchers wander randomly within their patrol radius until the
 *  player gets close, then BFS-chase. Level 3 has two wraiths so
 *  there's always a threat somewhere on the map. */
const LEVEL_CATCHERS: CatcherSpawn[][] = [
  // L1 Cavern — slime ambles around the middle of the map
  [{ kind: "slime", homeX: 9, homeY: 7, wanderRadius: 5 }],
  // L2 Spike Pit Ruins — single sentinel covering most of the maze
  [{ kind: "sentinel", homeX: 10, homeY: 7, wanderRadius: 6 }],
  // L3 Frozen Vault — TWO wraiths in opposite halves so you can
  // never just go around them on the ice.
  [
    { kind: "wraith", homeX: 6, homeY: 6, wanderRadius: 5 },
    { kind: "wraith", homeX: 14, homeY: 9, wanderRadius: 5 },
  ],
];
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  hue: number;
  r: number;
};
type Floater = {
  x: number;
  y: number;
  life: number;
  text: string;
  hue: number;
};

const TREASURE_VALUES: Record<TreasureKind, number> = {
  coin: 60,
  gem: 180,
  chest: 450,
};

function pickTreasureKind(): TreasureKind {
  const r = Math.random() * 100;
  if (r < 60) return "coin";
  if (r < 90) return "gem";
  return "chest";
}

function loadLevel(idx: number) {
  const level = LEVELS[idx];
  const grid = level.grid.map((row) => [...row]);
  const treasures: Treasure[] = [];
  const respawnsPer = LEVEL_RESPAWNS[idx] ?? 1;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] === 2) {
        grid[r][c] = 0;
        treasures.push({
          cx: c,
          cy: r,
          kind: pickTreasureKind(),
          phase: Math.random() * Math.PI * 2,
          alive: true,
          respawnsLeft: respawnsPer,
        });
      }
    }
  }
  const catchers: Catcher[] = (LEVEL_CATCHERS[idx] ?? []).map((sp) => {
    const def = CATCHER_DEFS[sp.kind];
    return {
      kind: sp.kind,
      cx: sp.homeX + 0.5,
      cy: sp.homeY + 0.5,
      homeX: sp.homeX,
      homeY: sp.homeY,
      wanderRadius: sp.wanderRadius ?? 4,
      // Seed wanderTarget at home so the first frame's empty path
      // immediately triggers a fresh random pick.
      wanderTargetX: sp.homeX,
      wanderTargetY: sp.homeY,
      state: "patrol",
      speed: def.speed,
      detectRange: def.detectRange,
      path: [],
      pathCool: 0,
      pauseFor: 0,
      walkPhase: 0,
      bobPhase: Math.random() * Math.PI * 2,
      alerted: false,
    };
  });
  if (process.env.NODE_ENV === "development") {
    validateLevel(idx, grid, treasures, catchers);
  }
  return { grid, treasures, theme: level.theme, catchers };
}

/** Pick a random cell that's safe to spawn a treasure on: must be
 *  walkable, not currently the player's tile or an immediate
 *  neighbour (so respawns don't auto-collect), not the exit, not on
 *  top of an existing alive treasure, and not under a catcher. */
function pickRespawnCell(
  grid: number[][],
  px: number,
  py: number,
  treasures: Treasure[],
  catchers: Catcher[],
): { c: number; r: number } | null {
  const playerCol = Math.floor(px);
  const playerRow = Math.floor(py);
  for (let attempt = 0; attempt < 80; attempt++) {
    const c = 1 + Math.floor(Math.random() * (COLS - 2));
    const r = 1 + Math.floor(Math.random() * (ROWS - 2));
    const v = grid[r]?.[c];
    if (v === undefined || v === 1 || v === 3) continue;
    if (Math.abs(c - playerCol) <= 1 && Math.abs(r - playerRow) <= 1) {
      continue;
    }
    let conflict = false;
    for (const t of treasures) {
      if (t.alive && t.cx === c && t.cy === r) {
        conflict = true;
        break;
      }
    }
    if (conflict) continue;
    for (const cat of catchers) {
      if (Math.floor(cat.cx) === c && Math.floor(cat.cy) === r) {
        conflict = true;
        break;
      }
    }
    if (conflict) continue;
    return { c, r };
  }
  return null;
}

/** BFS a path from (fromC,fromR) to (toC,toR) on the level grid,
 *  treating any non-wall cell as walkable. Returns the *cell
 *  waypoints* from the next step up to the goal (excluding the
 *  starting cell). Empty array means unreachable or already there. */
function bfsPath(
  grid: number[][],
  fromC: number,
  fromR: number,
  toC: number,
  toR: number,
): Array<{ c: number; r: number }> {
  if (fromC === toC && fromR === toR) return [];
  if (
    toR < 0 ||
    toR >= ROWS ||
    toC < 0 ||
    toC >= COLS ||
    grid[toR][toC] === 1
  ) {
    return [];
  }
  const visited: boolean[][] = Array.from({ length: ROWS }, () =>
    new Array(COLS).fill(false),
  );
  const parent: Array<Array<[number, number] | null>> = Array.from(
    { length: ROWS },
    () => new Array(COLS).fill(null),
  );
  const q: Array<[number, number]> = [[fromC, fromR]];
  visited[fromR][fromC] = true;
  let found = false;
  while (q.length) {
    const [c, r] = q.shift()!;
    if (c === toC && r === toR) {
      found = true;
      break;
    }
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nc = c + dc;
      const nr = r + dr;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      if (grid[nr][nc] === 1) continue;
      if (visited[nr][nc]) continue;
      visited[nr][nc] = true;
      parent[nr][nc] = [c, r];
      q.push([nc, nr]);
    }
  }
  if (!found) return [];
  const path: Array<{ c: number; r: number }> = [];
  let cur: [number, number] | null = [toC, toR];
  while (cur && (cur[0] !== fromC || cur[1] !== fromR)) {
    path.unshift({ c: cur[0], r: cur[1] });
    cur = parent[cur[1]][cur[0]];
  }
  return path;
}

/** Dev-time guard: BFS from the spawn cell (1,1) and assert that the
 *  exit and every treasure live in the connected region. Hazard
 *  tiles count as walkable for this check — they hurt you but they
 *  don't block the path. Logs to the console if anything is
 *  unreachable so we don't ship a level you can't finish. */
function validateLevel(
  idx: number,
  grid: number[][],
  treasures: Treasure[],
  catchers: Catcher[],
) {
  const visited = new Set<string>();
  const q: Array<[number, number]> = [[1, 1]];
  visited.add("1,1");
  while (q.length) {
    const [c, r] = q.shift()!;
    const moves: Array<[number, number]> = [
      [c + 1, r],
      [c - 1, r],
      [c, r + 1],
      [c, r - 1],
    ];
    for (const [nc, nr] of moves) {
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      if (grid[nr][nc] === 1) continue;
      const key = `${nc},${nr}`;
      if (visited.has(key)) continue;
      visited.add(key);
      q.push([nc, nr]);
    }
  }
  let exitOk = false;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] === 3 && visited.has(`${c},${r}`)) exitOk = true;
    }
  }
  if (!exitOk) {
    // eslint-disable-next-line no-console
    console.warn(
      `[treasure-hunt] level ${idx + 1} (${LEVELS[idx]?.theme.name}): exit is unreachable from spawn`,
    );
  }
  for (const t of treasures) {
    if (!visited.has(`${t.cx},${t.cy}`)) {
      // eslint-disable-next-line no-console
      console.warn(
        `[treasure-hunt] level ${idx + 1}: treasure at (${t.cx},${t.cy}) is unreachable`,
      );
    }
  }
  for (const c of catchers) {
    if (grid[c.homeY]?.[c.homeX] === 1) {
      // eslint-disable-next-line no-console
      console.warn(
        `[treasure-hunt] level ${idx + 1}: catcher home (${c.homeX},${c.homeY}) is on a wall`,
      );
    }
  }
}

type Phase = "ready" | "playing" | "level-clear" | "won" | "dead";

function makeFreshState() {
  const loaded = loadLevel(0);
  return {
    levelIdx: 0,
    grid: loaded.grid,
    theme: loaded.theme,
    treasures: loaded.treasures,
    catchers: loaded.catchers,
    pendingRespawns: [] as PendingRespawn[],
    px: 1.5,
    py: 1.5,
    vx: 0,
    vy: 0,
    facingX: 0,
    facingY: 1,
    walkPhase: 0,
    moving: false,
    stepCool: 0,
    elapsed: 0,
    levelElapsed: 0,
    particles: [] as Particle[],
    floaters: [] as Floater[],
    pickupFlash: 0,
    pickupHue: 50,
    lives: STARTING_LIVES,
    invulnFor: 0,
    hitFlash: 0,
  };
}

export default function TreasureHunt() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keys = useKeyboard();
  const [collected, setCollected] = useState(0);
  const [levelIdx, setLevelIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [time, setTime] = useState(0);
  const [lives, setLives] = useState(STARTING_LIVES);
  const [phase, setPhase] = useState<Phase>("ready");
  const [paused, setPaused] = useState(false);
  /** Treasures collected on the current level (for the level-clear
   *  overlay). The cumulative count goes up each level. */
  const [levelLoot, setLevelLoot] = useState({ got: 0, total: 0 });

  const finalScore = phase === "won" ? score + Math.max(0, 1500 - time * 4) : 0;
  const submitStatus = useSubmitScoreOnGameOver(
    "treasure-hunt",
    finalScore,
    phase === "won",
  );

  const phaseRef = useRef<Phase>("ready");
  phaseRef.current = phase;
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  const stateRef = useRef(makeFreshState());
  const ambienceRef = useRef<Ambience | null>(null);

  const start = useCallback(() => {
    stateRef.current = makeFreshState();
    setLevelIdx(0);
    setCollected(0);
    setScore(0);
    setTime(0);
    setLives(STARTING_LIVES);
    setPhase("playing");
    setPaused(false);
    setLevelLoot({
      got: 0,
      // Initial treasures + each one's respawn budget = total
      // possible pickups for this level.
      total:
        stateRef.current.treasures.length *
        (1 + (LEVEL_RESPAWNS[0] ?? 1)),
    });
    // Tear down any prior ambience and start the new level's drone.
    // Lazy creation here (instead of on mount) keeps the
    // AudioContext locked until the user clicks "Begin".
    ambienceRef.current?.stop();
    ambienceRef.current = createAmbience(
      stateRef.current.theme.ambience,
    );
  }, []);

  const togglePause = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    setPaused((p) => !p);
  }, []);

  // Tear the ambience down on unmount so navigating away doesn't
  // leave the oscillators humming.
  useEffect(() => {
    return () => {
      ambienceRef.current?.stop();
      ambienceRef.current = null;
    };
  }, []);

  // Duck the ambience to silence on pause / level-clear / won /
  // dead, and bring it back when we resume into "playing." We push
  // the level's intended volume back through setVolume so the new
  // value sticks even after the next mute toggle.
  useEffect(() => {
    if (!ambienceRef.current) return;
    const cfg = LEVELS[levelIdx]?.theme.ambience;
    if (!cfg) return;
    const audible = phase === "playing" && !paused;
    ambienceRef.current.setVolume(audible ? cfg.volume : 0);
  }, [phase, paused, levelIdx]);

  const advanceLevel = useCallback(() => {
    const st = stateRef.current;
    const next = st.levelIdx + 1;
    if (next >= LEVELS.length) {
      setPhase("won");
      Sfx.win();
      return;
    }
    const loaded = loadLevel(next);
    st.levelIdx = next;
    st.grid = loaded.grid;
    st.theme = loaded.theme;
    st.treasures = loaded.treasures;
    st.catchers = loaded.catchers;
    st.pendingRespawns = [];
    st.particles = [];
    st.floaters = [];
    st.px = 1.5;
    st.py = 1.5;
    st.vx = 0;
    st.vy = 0;
    st.facingX = 0;
    st.facingY = 1;
    st.levelElapsed = 0;
    st.invulnFor = 0;
    st.hitFlash = 0;
    setLevelIdx(next);
    setLevelLoot({
      got: 0,
      total: loaded.treasures.length * (1 + (LEVEL_RESPAWNS[next] ?? 1)),
    });
    setPhase("playing");
    // Swap to the next level's drone — fades the old one out as the
    // new one fades in.
    ambienceRef.current?.stop();
    ambienceRef.current = createAmbience(loaded.theme.ambience);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        e.preventDefault();
        togglePause();
        return;
      }
      // Quick-advance from level-clear overlay with Space/Enter
      if (
        phaseRef.current === "level-clear" &&
        (e.key === " " || e.key === "Enter")
      ) {
        e.preventDefault();
        advanceLevel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePause, advanceLevel]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();

    const explode = (
      st: ReturnType<typeof makeFreshState>,
      x: number,
      y: number,
      hue: number,
      n: number,
    ) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 60 + Math.random() * 140;
        st.particles.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 0.7,
          max: 0.7,
          hue,
          r: 1.5 + Math.random() * 2,
        });
      }
    };

    const tryMoveAxis = (dx: number, dy: number) => {
      const st = stateRef.current;
      if (dx === 0 && dy === 0) return true;
      const nx = st.px + dx;
      const ny = st.py + dy;
      const cx = Math.floor(nx);
      const cy = Math.floor(ny);
      if (st.grid[cy]?.[cx] === 1) return false;
      st.px = nx;
      st.py = ny;
      return true;
    };

    const checkPickups = () => {
      const st = stateRef.current;
      for (const t of st.treasures) {
        if (!t.alive) continue;
        const tcx = t.cx + 0.5;
        const tcy = t.cy + 0.5;
        const dx = st.px - tcx;
        const dy = st.py - tcy;
        if (dx * dx + dy * dy < 0.35 * 0.35) {
          t.alive = false;
          const value = TREASURE_VALUES[t.kind];
          setScore((s) => s + value);
          setCollected((c) => c + 1);
          setLevelLoot((l) => ({ ...l, got: l.got + 1 }));
          const px = tcx * CELL;
          const py = tcy * CELL;
          const hue =
            t.kind === "coin" ? 50 : t.kind === "gem" ? 270 : 30;
          st.pickupFlash = 0.35;
          st.pickupHue = hue;
          explode(st, px, py, hue, t.kind === "chest" ? 22 : 12);
          st.floaters.push({
            x: px,
            y: py - 6,
            life: 1,
            text: `+${value}`,
            hue,
          });
          if (t.kind === "coin") Sfx.pickup();
          else if (t.kind === "gem") Sfx.gem();
          else Sfx.chest();
          // If this treasure still has respawns left, queue another
          // copy of the same kind to pop somewhere random after a
          // short variable delay.
          if (t.respawnsLeft > 0) {
            st.pendingRespawns.push({
              delay: 1.5 + Math.random() * 1.6,
              kind: t.kind,
              respawnsLeft: t.respawnsLeft - 1,
            });
          }
        }
      }
    };

    const damagePlayer = () => {
      const st = stateRef.current;
      if (st.invulnFor > 0) return;
      st.invulnFor = INVULN_SECONDS;
      st.hitFlash = 0.5;
      // Knock the player back a touch — half a cell along the
      // negative of their current velocity, clamped to staying
      // inside a floor tile.
      const sp = Math.hypot(st.vx, st.vy);
      if (sp > 0.1) {
        const bx = st.px - (st.vx / sp) * 0.45;
        const by = st.py - (st.vy / sp) * 0.45;
        if (st.grid[Math.floor(by)]?.[Math.floor(bx)] !== 1) {
          st.px = bx;
          st.py = by;
        }
      }
      st.vx = 0;
      st.vy = 0;
      setLives((l) => {
        const next = l - 1;
        if (next <= 0) {
          setPhase("dead");
          Sfx.gameOver();
        } else {
          Sfx.error();
        }
        return Math.max(0, next);
      });
    };

    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      const k = keys.current;
      const live =
        phaseRef.current === "playing" && !pausedRef.current;

      // Always-tick decays — flashes, particles, treasure phases
      if (st.pickupFlash > 0)
        st.pickupFlash = Math.max(0, st.pickupFlash - dt * 3);
      if (st.hitFlash > 0)
        st.hitFlash = Math.max(0, st.hitFlash - dt * 2.5);
      if (st.invulnFor > 0)
        st.invulnFor = Math.max(0, st.invulnFor - dt);
      for (const t of st.treasures) t.phase += dt * 4;
      for (let i = st.particles.length - 1; i >= 0; i--) {
        const p = st.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.9;
        p.vy *= 0.9;
        p.life -= dt;
        if (p.life <= 0) st.particles.splice(i, 1);
      }
      st.floaters = st.floaters.filter((f) => (f.life -= dt) > 0);

      if (live) {
        st.elapsed += dt;
        st.levelElapsed += dt;
        setTime(Math.floor(st.elapsed));

        const speed = 5; // cells/sec target speed
        let inX = 0;
        let inY = 0;
        if (k.has("ArrowLeft") || k.has("a")) inX -= 1;
        if (k.has("ArrowRight") || k.has("d")) inX += 1;
        if (k.has("ArrowUp") || k.has("w")) inY -= 1;
        if (k.has("ArrowDown") || k.has("s")) inY += 1;
        const inLen = Math.hypot(inX, inY);
        const targetVx = inLen ? (inX / inLen) * speed : 0;
        const targetVy = inLen ? (inY / inLen) * speed : 0;

        // Friction model — ice gives a very long lerp (slippery);
        // every other floor tile snaps the velocity to the target
        // almost instantly. theme.allFloorIcy makes *every* walkable
        // cell slippery (used by Frozen Vault so spike tiles there
        // are also slippery).
        const cellAtFeet =
          st.grid[Math.floor(st.py)]?.[Math.floor(st.px)] ?? 0;
        const onIce =
          cellAtFeet === 5 ||
          (st.theme.allFloorIcy === true && cellAtFeet !== 1);
        const accel = onIce ? 1.5 : 28;
        const lerpK = 1 - Math.exp(-dt * accel);
        st.vx += (targetVx - st.vx) * lerpK;
        st.vy += (targetVy - st.vy) * lerpK;

        // Apply velocity per axis so we slide along walls
        if (!tryMoveAxis(st.vx * dt, 0)) st.vx = 0;
        if (!tryMoveAxis(0, st.vy * dt)) st.vy = 0;
        checkPickups();

        // Hazard: spike trap (active for SPIKE_ACTIVE_RATIO of cycle).
        // Cell-driven, not theme-driven, so any level can place
        // spike tiles — the Frozen Vault uses both ice friction and
        // spike traps simultaneously.
        if (cellAtFeet === 4) {
          const phaseInCycle =
            (st.levelElapsed % SPIKE_PERIOD) / SPIKE_PERIOD;
          if (phaseInCycle < SPIKE_ACTIVE_RATIO) damagePlayer();
        }

        // Catchers — patrol / chase / collide
        for (const cat of st.catchers) {
          updateCatcher(cat, st, dt);
          const dxc = cat.cx - st.px;
          const dyc = cat.cy - st.py;
          if (dxc * dxc + dyc * dyc < 0.55 * 0.55) {
            damagePlayer();
          }
        }

        // Treasure respawns — process the queue. When a delay
        // elapses, pick a random walkable cell that isn't on top of
        // the player, an existing treasure, the exit, or a catcher,
        // and pop a new treasure of the same kind there.
        for (let i = st.pendingRespawns.length - 1; i >= 0; i--) {
          const p = st.pendingRespawns[i];
          p.delay -= dt;
          if (p.delay > 0) continue;
          const spot = pickRespawnCell(
            st.grid,
            st.px,
            st.py,
            st.treasures,
            st.catchers,
          );
          st.pendingRespawns.splice(i, 1);
          if (spot) {
            st.treasures.push({
              cx: spot.c,
              cy: spot.r,
              kind: p.kind,
              phase: Math.random() * Math.PI * 2,
              alive: true,
              respawnsLeft: p.respawnsLeft,
            });
            // Sparkle burst at the new spot so the player notices
            const sx = (spot.c + 0.5) * CELL;
            const sy = (spot.r + 0.5) * CELL;
            const hue =
              p.kind === "coin"
                ? 50
                : p.kind === "gem"
                  ? 270
                  : 30;
            for (let j = 0; j < 10; j++) {
              const a = Math.random() * Math.PI * 2;
              st.particles.push({
                x: sx,
                y: sy,
                vx: Math.cos(a) * 80,
                vy: Math.sin(a) * 80,
                life: 0.6,
                max: 0.6,
                hue,
                r: 1.5 + Math.random() * 1.5,
              });
            }
          }
        }

        // Exit
        const standingOn = st.grid[Math.floor(st.py)]?.[Math.floor(st.px)];
        if (standingOn === 3) {
          if (st.levelIdx + 1 >= LEVELS.length) {
            setPhase("won");
            Sfx.win();
          } else {
            setPhase("level-clear");
            Sfx.win();
          }
        }

        // Movement / animation tracking
        const moving =
          Math.abs(st.vx) > 0.3 || Math.abs(st.vy) > 0.3;
        st.moving = moving;
        if (moving) {
          const sp = Math.hypot(st.vx, st.vy) || 1;
          st.facingX = st.vx / sp;
          st.facingY = st.vy / sp;
          st.walkPhase = (st.walkPhase + dt * 7) % 1;
          st.stepCool -= dt;
          if (st.stepCool <= 0) {
            st.stepCool = 0.32;
            // Slightly different step note on ice for flavour
            if (onIce) {
              Sfx.click();
            } else {
              Sfx.step();
            }
          }
        } else {
          st.stepCool = 0;
        }
      }

      // ============================================================
      // ----- DRAW -------------------------------------------------
      // ============================================================
      // Themed canvas backdrop — top-to-bottom gradient that matches
      // the level's atmosphere (warm cave, cold ruins, frozen vault).
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, st.theme.canvasFrom);
      bg.addColorStop(1, st.theme.canvasTo);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Floor + walls + hazards (pass 1: the static layer)
      const spikeProgress =
        (st.levelElapsed % SPIKE_PERIOD) / SPIKE_PERIOD;
      const spikeActiveDraw = spikeProgress < SPIKE_ACTIVE_RATIO;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const v = st.grid[r][c];
          const x = c * CELL;
          const y = r * CELL;
          if (v === 1) {
            drawWall(ctx, x, y, st.theme);
          } else {
            drawFloor(ctx, x, y, c, r, st.theme, v === 5);
          }
          if (v === 4) drawSpike(ctx, x, y, spikeActiveDraw, spikeProgress);
        }
      }

      // Theme decorations on a sparse subset of wall cells —
      // torches in the Cavern, hanging chains in the Ruins, ice
      // crystals in the Vault. Each theme picks its own density
      // (torches throw big glow pools and want a wider gap).
      let wallSeq = 0;
      const decoEvery = st.theme.decorationEvery;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (st.grid[r][c] !== 1) continue;
          wallSeq++;
          if (wallSeq % decoEvery !== 0) continue;
          const x = c * CELL;
          const y = r * CELL;
          if (st.theme.decoration === "torches") {
            drawTorch(ctx, x, y, now);
          } else if (st.theme.decoration === "chains") {
            drawChains(ctx, x, y);
          } else if (st.theme.decoration === "crystals") {
            drawCrystal(ctx, x, y, now);
          }
        }
      }

      // Exit — pulsing portal (themed accent)
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (st.grid[r][c] !== 3) continue;
          drawExit(ctx, c * CELL, r * CELL, now);
        }
      }

      // Treasures
      for (const t of st.treasures) {
        if (!t.alive) continue;
        drawTreasure(
          ctx,
          (t.cx + 0.5) * CELL,
          (t.cy + 0.5) * CELL,
          t.kind,
          t.phase,
        );
      }

      // Catchers — drawn under the player so the player stays
      // readable even mid-collision
      for (const cat of st.catchers) {
        drawCatcher(
          ctx,
          cat.cx * CELL,
          cat.cy * CELL,
          cat.kind,
          cat.walkPhase,
          cat.bobPhase,
          cat.state === "chase",
        );
      }

      // Player — flashes during invulnerability
      const blink =
        st.invulnFor > 0 && Math.floor(st.invulnFor * 12) % 2 === 0;
      if (!blink) {
        drawPlayer(
          ctx,
          st.px * CELL,
          st.py * CELL,
          st.facingX,
          st.facingY,
          st.walkPhase,
          st.moving,
        );
      }

      // Particles
      for (const p of st.particles) {
        const a = Math.max(0, p.life / p.max);
        ctx.fillStyle = `hsla(${p.hue}, 90%, 70%, ${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (0.5 + a * 0.7), 0, Math.PI * 2);
        ctx.fill();
      }

      // Floating score callouts
      ctx.font = "bold 14px system-ui";
      ctx.textAlign = "center";
      for (const f of st.floaters) {
        const a = Math.min(1, f.life / 0.6);
        ctx.fillStyle = `hsla(${f.hue}, 90%, 75%, ${a})`;
        ctx.fillText(f.text, f.x, f.y - (1 - f.life) * 28);
      }
      ctx.textAlign = "left";

      // Pickup flash (gold/purple/orange tint)
      if (st.pickupFlash > 0) {
        ctx.fillStyle = `hsla(${st.pickupHue}, 90%, 70%, ${st.pickupFlash * 0.25})`;
        ctx.fillRect(0, 0, W, H);
      }

      // Damage flash (red, longer-lived)
      if (st.hitFlash > 0) {
        ctx.fillStyle = `rgba(239, 68, 68, ${st.hitFlash * 0.45})`;
        ctx.fillRect(0, 0, W, H);
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const themeName = LEVELS[levelIdx]?.theme.name ?? "";

  return (
    <div
      className="absolute inset-0 flex flex-col p-2 sm:p-3 transition-colors"
      style={{
        background: `linear-gradient(135deg, ${LEVELS[levelIdx]?.theme.bgFrom ?? "#1a1208"}, ${LEVELS[levelIdx]?.theme.bgTo ?? "#0b0d12"})`,
        color: "white",
      }}
    >
      <div className="shrink-0 flex items-center justify-center gap-2 mb-2 text-white text-xs sm:text-sm flex-wrap">
        <Stat label="Score" value={score} accent />
        <Stat
          label="Lvl"
          value={`${levelIdx + 1}/${LEVELS.length} · ${themeName}`}
        />
        <Stat label="Loot" value={`${collected}`} icon="💎" />
        <span className="px-3 py-1 rounded-lg bg-rose-500/15 border border-rose-400/40 inline-flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-wider opacity-60 mr-1">
            Lives
          </span>
          {Array.from({ length: STARTING_LIVES }, (_, i) => (
            <span
              key={i}
              className={i < lives ? "" : "opacity-25"}
              aria-hidden
            >
              ❤️
            </span>
          ))}
        </span>
        <Stat label="Time" value={`${time}s`} icon="⏱️" />
        <SoundToggle />
        {phase === "playing" && (
          <PauseToggle paused={paused} onClick={togglePause} />
        )}
      </div>
      <div className="flex-1 min-h-0 w-full flex items-center justify-center">
        <div
          className="relative h-full max-w-full"
          style={{ aspectRatio: `${W} / ${H}` }}
        >
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="absolute inset-0 w-full h-full block rounded-xl border border-amber-900/40 shadow-[0_0_24px_rgba(0,0,0,0.5)]"
          />
          {phase === "ready" && (
            <GameOverlay
              icon="🗺️"
              title="Treasure Hunt"
              subtitle={
                <>
                  Three caves, three hazards. Coins, gems, and chests bank
                  score; the green portal is the way to the next level. You
                  have <b>{STARTING_LIVES} lives</b>.
                </>
              }
              primary={{ label: "▶ Begin", onClick: start }}
            />
          )}
          {paused && phase === "playing" && (
            <GameOverlay
              variant="blur"
              icon="⏸"
              title="Paused"
              subtitle={
                <>
                  Press{" "}
                  <kbd className="px-1.5 py-0.5 rounded bg-white/15 border border-white/25 text-white font-mono">
                    P
                  </kbd>{" "}
                  to resume
                </>
              }
              primary={{ label: "▶ Resume", onClick: () => setPaused(false) }}
            />
          )}
          {phase === "level-clear" && (
            <GameOverlay
              variant="blur"
              icon="🏁"
              title={`${LEVELS[levelIdx]?.theme.name ?? ""} cleared!`}
              subtitle={
                <>
                  Loot picked up: <b>{levelLoot.got}/{levelLoot.total}</b> ·
                  Score so far: <b>{score}</b>
                  <br />
                  Up next: <b>{LEVELS[levelIdx + 1]?.theme.name}</b> —{" "}
                  {LEVELS[levelIdx + 1]?.theme.blurb}
                </>
              }
              primary={{ label: "▶ Continue", onClick: advanceLevel }}
            />
          )}
          {phase === "won" && (
            <GameOverlay
              icon="🏆"
              title="Escaped the temple!"
              subtitle={`${collected} treasures · ${time}s · time bonus +${Math.max(0, 1500 - time * 4)}`}
              primary={{ label: "Run again", onClick: start }}
            >
              <div className="text-3xl font-black text-amber-400">
                Score: {finalScore}
              </div>
              <ScoreStatus gameSlug="treasure-hunt" status={submitStatus} />
            </GameOverlay>
          )}
          {phase === "dead" && (
            <GameOverlay
              icon="💀"
              title="You perished"
              subtitle={`Made it to ${themeName} · ${collected} treasures · ${score} pts`}
              primary={{ label: "Try again", onClick: start }}
            />
          )}
        </div>
      </div>
      <div className="shrink-0 mt-2 text-[11px] hidden sm:block text-white/60 text-center">
        <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono">WASD</kbd>{" "}
        /
        <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono">↑↓←→</kbd>{" "}
        move ·{" "}
        <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono">P</kbd>{" "}
        pauses
      </div>
    </div>
  );
}

// =================================================================
// ----- TILE / ENTITY DRAWING -------------------------------------
// =================================================================

function drawWall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  theme: LevelTheme,
) {
  ctx.fillStyle = theme.wall;
  ctx.fillRect(x, y, CELL, CELL);
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fillRect(x, y, CELL, 4);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(x, y + CELL - 3, CELL, 3);
}

function drawFloor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  col: number,
  row: number,
  theme: LevelTheme,
  isIce: boolean,
) {
  if (isIce) {
    // Light blue tinted floor with sparkle dots
    const grad = ctx.createLinearGradient(x, y, x, y + CELL);
    grad.addColorStop(0, "#2a5a85");
    grad.addColorStop(1, "#163d5f");
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, CELL, CELL);
    ctx.fillStyle = "rgba(180,225,255,0.25)";
    if ((col * 7 + row * 11) % 5 === 0) {
      ctx.fillRect(x + 6, y + 6, 2, 2);
      ctx.fillRect(x + 18, y + 22, 2, 2);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
    return;
  }
  ctx.fillStyle = theme.floor;
  ctx.fillRect(x, y, CELL, CELL);
  if ((col * 7 + row * 13) % 5 === 0) {
    ctx.fillStyle = `hsla(${theme.accent === "#22d3ee" ? 200 : 35}, 80%, 70%, 0.06)`;
    ctx.fillRect(x + 6, y + 8, 2, 2);
  }
}

function drawSpike(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  active: boolean,
  cycleProgress: number,
) {
  // Always draw a faint pit so the player knows the tile is risky
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(x + 4, y + 4, CELL - 8, CELL - 8);
  ctx.strokeStyle = "rgba(255, 80, 80, 0.45)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 4, y + 4, CELL - 8, CELL - 8);
  if (active) {
    // Spikes raised — three triangles pointing up, height pulses
    // through the active phase so they read as freshly extended
    const easing = Math.sin((cycleProgress / 0.45) * Math.PI);
    const tipLift = 4 + easing * 4;
    ctx.fillStyle = "#cbd5e1";
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const tx = x + 6 + i * 8;
      ctx.beginPath();
      ctx.moveTo(tx, y + CELL - 5);
      ctx.lineTo(tx + 4, y + CELL - 5 - tipLift - 4);
      ctx.lineTo(tx + 8, y + CELL - 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // Bright red glint along the base when actively dangerous
    ctx.fillStyle = `rgba(239,68,68,${0.6 + easing * 0.3})`;
    ctx.fillRect(x + 4, y + CELL - 6, CELL - 8, 2);
  } else {
    // Tucked in — tiny dots indicating "spike sockets"
    ctx.fillStyle = "rgba(80,80,80,0.6)";
    for (let i = 0; i < 3; i++) {
      const tx = x + 8 + i * 8;
      ctx.fillRect(tx, y + CELL - 6, 4, 2);
    }
  }
}

/** A flickering wall torch — used by the Cavern level. The flame's
 *  scale wobbles based on `now` and the wall position so torches
 *  around the map don't all flicker in sync. */
function drawTorch(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  now: number,
) {
  const cx = x + CELL / 2;
  const cy = y + CELL / 2 - 2;
  const flicker = 0.78 + 0.22 * Math.sin(now * 0.018 + x * 0.13 + y * 0.07);
  // Glow pool spilling onto adjacent cells
  const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 26);
  g.addColorStop(0, `rgba(255, 200, 80, ${0.5 * flicker})`);
  g.addColorStop(1, "rgba(255, 200, 80, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, 26, 0, Math.PI * 2);
  ctx.fill();
  // Iron sconce
  ctx.fillStyle = "#1f1208";
  ctx.fillRect(cx - 3, cy + 4, 6, 6);
  ctx.fillStyle = "#3a2810";
  ctx.fillRect(cx - 4, cy + 9, 8, 2);
  // Flame layers
  ctx.fillStyle = "#fde68a";
  ctx.beginPath();
  ctx.ellipse(cx, cy - 1, 4 * flicker, 7 * flicker, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f97316";
  ctx.beginPath();
  ctx.ellipse(cx, cy, 3 * flicker, 5 * flicker, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fef3c7";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 1, 1.4 * flicker, 2.5 * flicker, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** A short hanging chain — used by the Spike Pit Ruins. Hangs over
 *  the centre of the wall cell so it reads as a dungeon dressing. */
function drawChains(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const cx = x + CELL / 2;
  // Mounting bracket
  ctx.fillStyle = "#1a1a22";
  ctx.fillRect(cx - 4, y + 3, 8, 2);
  // Chain links
  ctx.strokeStyle = "#5a5a6a";
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 5; i++) {
    const ly = y + 6 + i * 4;
    ctx.beginPath();
    ctx.ellipse(cx, ly, 2, 1.6, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Iron cuff at the bottom
  ctx.fillStyle = "#3a3a48";
  ctx.fillRect(cx - 3, y + 26, 6, 3);
}

/** Cluster of pale-blue ice crystals — used by the Frozen Vault.
 *  The cluster has a subtle slow shimmer to match the cold theme. */
function drawCrystal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  now: number,
) {
  const cx = x + CELL / 2;
  const cy = y + CELL / 2 + 2;
  const shimmer = 0.7 + 0.3 * Math.sin(now * 0.005 + x * 0.07);
  // Aura
  const g = ctx.createRadialGradient(cx, cy, 3, cx, cy, 20);
  g.addColorStop(0, `rgba(125, 211, 252, ${0.45 * shimmer})`);
  g.addColorStop(1, "rgba(125, 211, 252, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, 20, 0, Math.PI * 2);
  ctx.fill();
  // Three stacked crystal shards of varying heights
  const shards: Array<[number, number, number]> = [
    [-5, 0, 8],
    [0, -3, 11],
    [5, 1, 7],
  ];
  for (const [dx, dy, h] of shards) {
    ctx.fillStyle = "#bae6fd";
    ctx.beginPath();
    ctx.moveTo(cx + dx, cy + dy - h);
    ctx.lineTo(cx + dx + 3, cy + dy);
    ctx.lineTo(cx + dx, cy + dy + 1);
    ctx.lineTo(cx + dx - 3, cy + dy);
    ctx.closePath();
    ctx.fill();
    // Inner highlight for refraction
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath();
    ctx.moveTo(cx + dx, cy + dy - h + 1);
    ctx.lineTo(cx + dx + 1, cy + dy - 1);
    ctx.lineTo(cx + dx, cy + dy);
    ctx.lineTo(cx + dx - 1, cy + dy - 1);
    ctx.closePath();
    ctx.fill();
  }
}

function drawExit(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  now: number,
) {
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;
  const pulse = 0.5 + 0.5 * Math.sin(now * 0.005);
  const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, 30);
  glow.addColorStop(0, `rgba(34,197,94,${0.55 * pulse + 0.25})`);
  glow.addColorStop(1, "rgba(34,197,94,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#16a34a";
  roundRect(ctx, x + 4, y + 3, CELL - 8, CELL - 6, 5);
  ctx.fill();
  ctx.fillStyle = "#22c55e";
  roundRect(ctx, x + 7, y + 6, CELL - 14, CELL - 12, 4);
  ctx.fill();
  ctx.fillStyle = "white";
  ctx.font = "bold 11px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("EXIT", cx, cy + 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

/** Top-down explorer sprite — head, hat, jacket body, animated legs,
 *  and a torch glow positioned in the facing direction. */
/** Pick a random walkable cell within the catcher's wander radius
 *  to be its next idle destination. Try a handful of angles; if
 *  every candidate hits a wall, fall back to the home cell. */
function pickWanderTarget(cat: Catcher, grid: number[][]) {
  for (let attempt = 0; attempt < 24; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 1 + Math.random() * cat.wanderRadius;
    const tc = Math.floor(cat.homeX + Math.cos(angle) * radius);
    const tr = Math.floor(cat.homeY + Math.sin(angle) * radius);
    if (tc < 1 || tc >= COLS - 1) continue;
    if (tr < 1 || tr >= ROWS - 1) continue;
    if (grid[tr]?.[tc] === 1) continue;
    if (Math.floor(cat.cx) === tc && Math.floor(cat.cy) === tr) continue;
    cat.wanderTargetX = tc;
    cat.wanderTargetY = tr;
    return;
  }
  cat.wanderTargetX = cat.homeX;
  cat.wanderTargetY = cat.homeY;
}

function updateCatcher(
  cat: Catcher,
  st: { grid: number[][]; px: number; py: number },
  dt: number,
) {
  const dxToPlayer = cat.cx - st.px;
  const dyToPlayer = cat.cy - st.py;
  const distToPlayer = Math.hypot(dxToPlayer, dyToPlayer);

  // State machine — patrol / chase with hysteresis so the catcher
  // doesn't flicker between states at the edge of detection range.
  const wasChasing = cat.state === "chase";
  if (cat.state === "patrol" && distToPlayer < cat.detectRange) {
    cat.state = "chase";
    // Wake up + drop any pending pause / cached path so the chase
    // starts immediately.
    cat.pauseFor = 0;
    cat.path = [];
    cat.pathCool = 0;
  } else if (
    cat.state === "chase" &&
    distToPlayer > cat.detectRange + 2.5
  ) {
    cat.state = "patrol";
    cat.path = [];
    cat.pathCool = 0;
    // Pick a fresh wander target so the catcher stops mid-chase
    // path and starts moving organically again.
    pickWanderTarget(cat, st.grid);
  }
  if (!wasChasing && cat.state === "chase" && !cat.alerted) {
    cat.alerted = true;
    Sfx.error();
  } else if (cat.state === "patrol") {
    cat.alerted = false;
  }

  // Pause beat — only honoured during patrol; if the player stumbles
  // into detection range we drop pauseFor in the transition above.
  if (cat.pauseFor > 0) {
    cat.pauseFor = Math.max(0, cat.pauseFor - dt);
    cat.bobPhase = (cat.bobPhase + dt * 3) % (Math.PI * 2);
    return;
  }

  // Recompute path periodically (BFS is cheap enough that we can
  // re-plan a few times per second; doing it every frame would
  // waste cycles for negligible feel improvement).
  cat.pathCool -= dt;
  if (cat.pathCool <= 0) {
    cat.pathCool = 0.3;
    let goalC: number;
    let goalR: number;
    if (cat.state === "chase") {
      goalC = Math.max(0, Math.min(COLS - 1, Math.floor(st.px)));
      goalR = Math.max(0, Math.min(ROWS - 1, Math.floor(st.py)));
    } else {
      goalC = cat.wanderTargetX;
      goalR = cat.wanderTargetY;
    }
    cat.path = bfsPath(
      st.grid,
      Math.floor(cat.cx),
      Math.floor(cat.cy),
      goalC,
      goalR,
    );
  }

  // Walk along the cached path
  if (cat.path.length > 0) {
    const next = cat.path[0];
    const targetX = next.c + 0.5;
    const targetY = next.r + 0.5;
    const dxn = targetX - cat.cx;
    const dyn = targetY - cat.cy;
    const dist = Math.hypot(dxn, dyn);
    if (dist < 0.05) {
      cat.path.shift();
    } else {
      const step = Math.min(cat.speed * dt, dist);
      cat.cx += (dxn / dist) * step;
      cat.cy += (dyn / dist) * step;
      if (step >= dist - 0.001) cat.path.shift();
    }
  } else if (cat.state === "patrol") {
    // Reached the current wander target — pick a fresh random
    // destination, and one in three times take a brief beat so the
    // catcher doesn't pace nonstop in a straight line.
    pickWanderTarget(cat, st.grid);
    cat.pathCool = 0;
    if (Math.random() < 0.35) {
      cat.pauseFor = 0.4 + Math.random() * 1.2;
    }
  }

  cat.walkPhase = (cat.walkPhase + dt * 5) % 1;
  cat.bobPhase = (cat.bobPhase + dt * 3) % (Math.PI * 2);
}

function drawCatcher(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  kind: CatcherKind,
  walkPhase: number,
  bobPhase: number,
  alerted: boolean,
) {
  // "Spotted" indicator — a small red exclamation mark above the
  // catcher whenever it's actively chasing the player. Helpful at a
  // glance, especially when there's only one catcher per level.
  if (alerted) {
    ctx.save();
    ctx.translate(x, y - 18);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    roundRect(ctx, -4, -7, 8, 12, 2);
    ctx.fill();
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(-1, -5, 2, 6);
    ctx.fillRect(-1, 2, 2, 2);
    ctx.restore();
  }
  switch (kind) {
    case "slime":
      drawSlime(ctx, x, y, bobPhase);
      return;
    case "sentinel":
      drawSentinel(ctx, x, y, walkPhase);
      return;
    case "wraith":
      drawWraith(ctx, x, y, bobPhase);
      return;
  }
}

function drawSlime(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  bobPhase: number,
) {
  const wob = 1 + 0.12 * Math.sin(bobPhase);
  ctx.save();
  ctx.translate(x, y);
  // Aura
  const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 16);
  g.addColorStop(0, "rgba(34,197,94,0.45)");
  g.addColorStop(1, "rgba(34,197,94,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, Math.PI * 2);
  ctx.fill();
  // Squashy body
  ctx.fillStyle = "#16a34a";
  ctx.beginPath();
  ctx.ellipse(0, 1, 9 * wob, 8 / wob, 0, 0, Math.PI * 2);
  ctx.fill();
  // Highlight
  ctx.fillStyle = "rgba(220,255,210,0.45)";
  ctx.beginPath();
  ctx.ellipse(-2.5, -2, 3, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Eyes
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.arc(-3, 0, 2, 0, Math.PI * 2);
  ctx.arc(3, 0, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0a0a0a";
  ctx.beginPath();
  ctx.arc(-3, 0, 1, 0, Math.PI * 2);
  ctx.arc(3, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSentinel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  walkPhase: number,
) {
  const stride = Math.sin(walkPhase * Math.PI * 2) * 2;
  ctx.save();
  ctx.translate(x, y);
  // Aura (red — danger)
  const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 18);
  g.addColorStop(0, "rgba(239,68,68,0.5)");
  g.addColorStop(1, "rgba(239,68,68,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, Math.PI * 2);
  ctx.fill();
  // Legs (alternating stride)
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(-3.5, 4 + stride, 3, 5);
  ctx.fillRect(0.5, 4 - stride, 3, 5);
  // Stone-armoured body
  ctx.fillStyle = "#475569";
  ctx.beginPath();
  ctx.ellipse(0, 0, 7, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Belt
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(-6, 3, 12, 1.5);
  // Helmet
  ctx.fillStyle = "#334155";
  ctx.beginPath();
  ctx.arc(0, -4, 5, 0, Math.PI * 2);
  ctx.fill();
  // Visor — glowing red eye slit
  ctx.fillStyle = "#ef4444";
  ctx.fillRect(-3, -5, 6, 1.6);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillRect(-2.5, -4.7, 5, 0.4);
  ctx.restore();
}

function drawWraith(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  bobPhase: number,
) {
  const float = Math.sin(bobPhase) * 1.6;
  ctx.save();
  ctx.translate(x, y + float);
  // Aura
  const g = ctx.createRadialGradient(0, 0, 3, 0, 0, 20);
  g.addColorStop(0, "rgba(34,211,238,0.55)");
  g.addColorStop(1, "rgba(34,211,238,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 20, 0, Math.PI * 2);
  ctx.fill();
  // Body — translucent blue blob with a tail of mist
  ctx.fillStyle = "rgba(125, 211, 252, 0.78)";
  ctx.beginPath();
  ctx.moveTo(-7, -5);
  ctx.bezierCurveTo(-9, -2, -9, 4, -6, 6);
  ctx.bezierCurveTo(-3, 8, 3, 8, 6, 6);
  ctx.bezierCurveTo(9, 4, 9, -2, 7, -5);
  ctx.bezierCurveTo(4, -9, -4, -9, -7, -5);
  ctx.fill();
  // Crystal spikes around the body
  ctx.fillStyle = "#bae6fd";
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(2, -5);
  ctx.lineTo(-2, -5);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-8, -1);
  ctx.lineTo(-4, 1);
  ctx.lineTo(-9, 2);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(8, -1);
  ctx.lineTo(4, 1);
  ctx.lineTo(9, 2);
  ctx.closePath();
  ctx.fill();
  // Glowing cyan eyes
  ctx.fillStyle = "#67e8f9";
  ctx.beginPath();
  ctx.arc(-3, -1, 1.6, 0, Math.PI * 2);
  ctx.arc(3, -1, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.arc(-3, -1.4, 0.6, 0, Math.PI * 2);
  ctx.arc(3, -1.4, 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  facingX: number,
  facingY: number,
  walkPhase: number,
  moving: boolean,
) {
  const stride = moving ? Math.sin(walkPhase * Math.PI * 2) * 2.2 : 0;

  // Torch — small glow ahead of the player, in the direction of travel
  const tlen = 9;
  const tFx = (facingX || 0) * tlen;
  const tFy = (facingY || 0) * tlen;
  const ftx = facingX === 0 && facingY === 0 ? 0 : tFx;
  const fty = facingX === 0 && facingY === 0 ? tlen : tFy;
  const tg = ctx.createRadialGradient(
    x + ftx,
    y + fty,
    0,
    x + ftx,
    y + fty,
    24,
  );
  tg.addColorStop(0, "rgba(255,200,80,0.55)");
  tg.addColorStop(1, "rgba(255,200,80,0)");
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.arc(x + ftx, y + fty, 24, 0, Math.PI * 2);
  ctx.fill();

  // Backpack
  ctx.fillStyle = "#5a3a1a";
  roundRect(ctx, x - 5, y - 1, 10, 7, 1.5);
  ctx.fill();
  ctx.fillStyle = "#3a2810";
  ctx.fillRect(x - 5, y + 2, 10, 1.5);

  // Legs
  ctx.fillStyle = "#2a1f12";
  ctx.fillRect(x - 3.5, y + 5 + stride, 3, 5);
  ctx.fillRect(x + 0.5, y + 5 - stride, 3, 5);

  // Body (jacket)
  ctx.fillStyle = "#2a4a8a";
  ctx.beginPath();
  ctx.ellipse(x, y, 7, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Belt
  ctx.fillStyle = "#5a3a1a";
  ctx.fillRect(x - 6, y + 3, 12, 1.5);

  // Head
  ctx.fillStyle = "#e4b896";
  ctx.beginPath();
  ctx.arc(x, y - 4, 5, 0, Math.PI * 2);
  ctx.fill();

  // Hat
  ctx.fillStyle = "#3a2810";
  ctx.beginPath();
  ctx.ellipse(x, y - 5, 7, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y - 7, 3.5, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6b4a25";
  ctx.fillRect(x - 3.5, y - 6, 7, 0.8);

  // Torch flame
  ctx.fillStyle = "#fde68a";
  ctx.beginPath();
  ctx.arc(x + ftx, y + fty, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.arc(x + ftx, y + fty, 0.9, 0, Math.PI * 2);
  ctx.fill();
}

function drawTreasure(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  kind: TreasureKind,
  phase: number,
) {
  const wob = 1 + 0.12 * Math.sin(phase);
  ctx.save();
  ctx.translate(x, y);
  if (kind === "coin") {
    const g = ctx.createRadialGradient(0, 0, 3, 0, 0, 14);
    g.addColorStop(0, "rgba(252,211,77,0.7)");
    g.addColorStop(1, "rgba(252,211,77,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.scale(wob, 1);
    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fde68a";
    ctx.beginPath();
    ctx.arc(-1.5, -2, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(120, 80, 0, 0.85)";
    ctx.font = "bold 8px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("$", 0, 1);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  } else if (kind === "gem") {
    const g = ctx.createRadialGradient(0, 0, 3, 0, 0, 18);
    g.addColorStop(0, "rgba(167,139,250,0.85)");
    g.addColorStop(1, "rgba(167,139,250,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(phase * 0.4);
    ctx.fillStyle = "#a78bfa";
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(7, 0);
    ctx.lineTo(0, 9);
    ctx.lineTo(-7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#c4b5fd";
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(3.5, -2);
    ctx.lineTo(0, 0);
    ctx.lineTo(-3.5, -2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(2, -4);
    ctx.lineTo(0, -2);
    ctx.lineTo(-2, -4);
    ctx.closePath();
    ctx.fill();
  } else {
    const bob = Math.sin(phase) * 1;
    ctx.translate(0, bob);
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 22);
    g.addColorStop(0, "rgba(245,158,11,0.55)");
    g.addColorStop(1, "rgba(245,158,11,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#7a4a1a";
    roundRect(ctx, -10, -3, 20, 12, 2);
    ctx.fill();
    ctx.fillStyle = "#5a3410";
    roundRect(ctx, -10, -8, 20, 6, 2);
    ctx.fill();
    ctx.fillStyle = "#3a3a3a";
    ctx.fillRect(-10, -2, 20, 1.5);
    ctx.fillRect(-9, -8, 1.5, 17);
    ctx.fillRect(7.5, -8, 1.5, 17);
    ctx.fillStyle = "#facc15";
    ctx.fillRect(-2.5, -3, 5, 4);
    ctx.fillStyle = "#92400e";
    ctx.fillRect(-1, -1, 2, 2);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fillRect(-9.5, -8, 5, 1);
  }
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function Stat({
  label,
  value,
  accent = false,
  icon,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
  icon?: string;
}) {
  return (
    <span
      className={`px-3 py-1 rounded-lg ${
        accent
          ? "bg-amber-400/15 border border-amber-400/40"
          : "bg-white/10"
      } inline-flex items-center gap-1.5`}
    >
      {icon && <span className="opacity-90">{icon}</span>}
      <span className="text-[10px] uppercase tracking-wider opacity-60">
        {label}
      </span>
      <b>{value}</b>
    </span>
  );
}
