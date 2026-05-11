"use client";

/**
 * Agma — chaos-mode cell game.
 *
 * The "fast and dangerous" sibling of Agar: smaller arena, more bots,
 * three new mechanics.
 *
 *   - Split (Space): tear your largest cell in half — half the mass,
 *     one piece launches forward at high speed. Use it to catch a
 *     fleeing prey or to escape a doomed corner. Each split puts you
 *     on a 10s merge cooldown; touch your own cells while the
 *     cooldown is over and they fuse back into one.
 *
 *   - Eject mass (W): spit a small chunk of mass forward. Costs you
 *     ~10% radius, lands as a food pellet. Used to bait viruses or
 *     just to ditch weight when you need to outrun a threat.
 *
 *   - Viruses: stationary green spiky cells. If a player- or bot-
 *     cell that's *bigger* than the virus runs into it, that cell
 *     shatters into 6 pieces. Smaller cells slide past safely. The
 *     classic Agar.io hazard, finally added.
 *
 * Architecture is the cousin of games/agar-clone — same Vec2 + AABB-
 * style world, single rAF loop, score/best/leaderboard wiring — but
 * the cell list is now a per-entity multi-cell setup ("ownerId"
 * groups all of one player's split cells), and the food list mixes
 * pellets, ejected-mass projectiles, and viruses in their own
 * arrays for clarity.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";
import { GameOverlay, PauseToggle } from "@/components/games/GameOverlay";
import { SoundToggle } from "@/components/SoundToggle";
import { Sfx, createAmbience, type Ambience } from "@/lib/sound";

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

const WORLD = 2400; // smaller than Agar (4200) → denser, more chaotic
const VIEW_W = 960;
const VIEW_H = 600;
const FOOD_COUNT = 380;
const BOT_COUNT = 18; // more bots than Agar's 14
const VIRUS_COUNT = 9;
const BASE_R = 24;
const FOOD_R = 5;
/** Eat-ratio: a cell needs to be at least this much bigger to eat
 *  another. Slightly tighter than Agar so the arena stays spicy. */
const EAT_RATIO = 1.18;
const BASE_SPEED = 250;
/** Minimum radius required to split — small cells can't split. */
const SPLIT_MIN_R = 28;
/** Minimum radius required to eject mass. */
const EJECT_MIN_R = 22;
/** Mass given up per eject (in radius units, before mass-conservation). */
const EJECT_MASS_R = 7;
/** How fast the ejected pellet travels initially (px/s). */
const EJECT_SPEED = 520;
/** Friction applied to ejected pellets each second so they slow down. */
const EJECT_FRICTION = 1.8;
/** Speed at which a freshly split cell launches forward. */
const SPLIT_LAUNCH_SPEED = 720;
/** Seconds before two cells of the same owner can re-merge. */
const SPLIT_MERGE_COOLDOWN = 10;
/** Virus radius — tuned so the smallest threat-eating-virus pop is
 *  roughly the player at twice the base radius. */
const VIRUS_R = 38;
/** When a virus pops a cell, that cell splits into this many pieces. */
const VIRUS_SHARDS = 6;
/** Maximum cells one entity can own — caps virus chain reactions. */
const MAX_OWNER_CELLS = 16;

type Vec2 = { x: number; y: number };

type AI = {
  wanderUntil: number;
  tx: number;
  ty: number;
};

type Cell = {
  /** Stable id for the entity controlling this cell. Player is "p"; bots
   *  are "b{n}". A single owner can hold multiple cells (after splits). */
  ownerId: string;
  isPlayer: boolean;
  pos: Vec2;
  vel: Vec2;
  r: number;
  hue: number;
  alive: boolean;
  /** Game-time at which this cell can fuse with same-owner cells. */
  mergeAt: number;
  /** Optional AI block — only present on bot cells. */
  ai?: AI;
};

type Food = { pos: Vec2; r: number; hue: number };

/** Ejected mass pellet — flies forward, slows down, becomes food when
 *  it stops (or gets eaten mid-flight). */
type Eject = {
  pos: Vec2;
  vel: Vec2;
  r: number;
  hue: number;
  /** Owner who ejected this; we ignore self-ingestion for ~0.5s so
   *  you don't immediately re-eat your own mass. */
  ownerId: string;
  ignoreUntil: number;
};

type Virus = {
  pos: Vec2;
  r: number;
};

type State = {
  cells: Cell[];
  food: Food[];
  ejects: Eject[];
  viruses: Virus[];
  mouseScreen: Vec2;
  cameraX: number;
  cameraY: number;
  zoom: number;
  elapsed: number; // seconds
  /** Monotonic id counter for new cells; lets the loop allocate
   *  unique ids without colliding with existing bot ids. */
  nextEntityNumber: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rng(min: number, max: number) {
  return min + Math.random() * (max - min);
}

/** Mass conservation when merging two cells: r_new = sqrt(r1² + r2²). */
function combineRadii(r1: number, r2: number): number {
  return Math.sqrt(r1 * r1 + r2 * r2);
}

function makeFood(): Food {
  return {
    pos: { x: rng(20, WORLD - 20), y: rng(20, WORLD - 20) },
    r: FOOD_R + Math.random() * 2,
    hue: Math.random() * 360,
  };
}

function makeVirus(): Virus {
  return {
    pos: { x: rng(150, WORLD - 150), y: rng(150, WORLD - 150) },
    r: VIRUS_R,
  };
}

function makeBotCell(idNum: number): Cell {
  return {
    ownerId: `b${idNum}`,
    isPlayer: false,
    pos: { x: rng(120, WORLD - 120), y: rng(120, WORLD - 120) },
    vel: { x: 0, y: 0 },
    r: BASE_R * (0.7 + Math.random() * 1.4),
    hue: (idNum * 37) % 360,
    alive: true,
    mergeAt: 0,
    ai: { wanderUntil: 0, tx: 0, ty: 0 },
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Agma() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [score, setScore] = useState(0);
  const [size, setSize] = useState(BASE_R);
  const [rank, setRank] = useState(BOT_COUNT + 1);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState(false);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [cellCount, setCellCount] = useState(1);

  // Tense sawtooth pad — Agma is the chaotic sibling of Agar, so the
  // bed leans on a darker E♭-minor stack with more filter movement.
  const ambienceRef = useRef<Ambience | null>(null);
  useEffect(() => {
    if (!started) return;
    if (ambienceRef.current) return;
    ambienceRef.current = createAmbience({
      notes: [78, 93, 117, 139], // E♭2 G♭2 B♭2 D♭3
      type: "sawtooth",
      volume: 0.022,
      filterFreq: 600,
      modDepth: 260,
      modSpeed: 0.25,
    });
    return () => {
      ambienceRef.current?.stop();
      ambienceRef.current = null;
    };
  }, [started]);

  const submitStatus = useSubmitScoreOnGameOver("agma", score, over);

  // Refs that mirror React state into the rAF loop's closure so we
  // don't have to re-bind the loop on every flip.
  const startedRef = useRef(false);
  startedRef.current = started;
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const overRef = useRef(false);
  overRef.current = over;

  const stateRef = useRef<State>({
    cells: [],
    food: [],
    ejects: [],
    viruses: [],
    mouseScreen: { x: VIEW_W / 2, y: VIEW_H / 2 - 80 },
    cameraX: WORLD / 2,
    cameraY: WORLD / 2,
    zoom: 1,
    elapsed: 0,
    nextEntityNumber: BOT_COUNT,
  });

  // Best-score persistence
  useEffect(() => {
    setBest(Number(localStorage.getItem("nexplay:agma-best") || 0));
  }, []);

  // -------------------------------------------------------------------------
  // Reset / start
  // -------------------------------------------------------------------------

  const reset = useCallback(() => {
    const food: Food[] = Array.from({ length: FOOD_COUNT }, makeFood);
    const viruses: Virus[] = Array.from({ length: VIRUS_COUNT }, makeVirus);
    const player: Cell = {
      ownerId: "p",
      isPlayer: true,
      pos: { x: WORLD / 2, y: WORLD / 2 },
      vel: { x: 0, y: 0 },
      r: BASE_R,
      hue: 18, // warm orange — matches the catalog gradient
      alive: true,
      mergeAt: 0,
    };
    const bots = Array.from({ length: BOT_COUNT }, (_, i) => makeBotCell(i));
    stateRef.current = {
      cells: [player, ...bots],
      food,
      ejects: [],
      viruses,
      mouseScreen: { x: VIEW_W / 2, y: VIEW_H / 2 - 80 },
      cameraX: WORLD / 2,
      cameraY: WORLD / 2,
      zoom: 1,
      elapsed: 0,
      nextEntityNumber: BOT_COUNT,
    };
    setScore(0);
    setSize(BASE_R);
    setRank(BOT_COUNT + 1);
    setOver(false);
    setStarted(false);
    setPaused(false);
    setCellCount(1);
  }, []);

  const start = useCallback(() => {
    reset();
    setStarted(true);
  }, [reset]);

  const togglePause = useCallback(() => {
    if (overRef.current || !startedRef.current) return;
    setPaused((p) => !p);
  }, []);

  useEffect(() => {
    reset();
  }, [reset]);

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  // Mouse / touch tracking — same approach as Agar.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const setFromClient = (cx: number, cy: number) => {
      const rect = wrap.getBoundingClientRect();
      stateRef.current.mouseScreen = {
        x: ((cx - rect.left) / rect.width) * VIEW_W,
        y: ((cy - rect.top) / rect.height) * VIEW_H,
      };
    };
    const onMove = (e: MouseEvent) => setFromClient(e.clientX, e.clientY);
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      e.preventDefault();
      setFromClient(t.clientX, t.clientY);
    };
    wrap.addEventListener("mousemove", onMove);
    wrap.addEventListener("touchstart", onTouch, { passive: false });
    wrap.addEventListener("touchmove", onTouch, { passive: false });
    return () => {
      wrap.removeEventListener("mousemove", onMove);
      wrap.removeEventListener("touchstart", onTouch);
      wrap.removeEventListener("touchmove", onTouch);
    };
  }, []);

  // Keyboard — Space to split, W to eject, P/Esc to pause.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === "p" || k === "escape") {
        e.preventDefault();
        togglePause();
      } else if (k === " ") {
        e.preventDefault();
        if (startedRef.current && !pausedRef.current && !overRef.current) {
          splitPlayer();
        }
      } else if (k === "w") {
        if (startedRef.current && !pausedRef.current && !overRef.current) {
          ejectPlayerMass();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePause]);

  // -------------------------------------------------------------------------
  // Split / eject — operate on stateRef directly. Both go through the
  // mouse-direction so the player has explicit control of where the
  // launched mass goes.
  // -------------------------------------------------------------------------

  function aimDirFromMouse(cellPos: Vec2): Vec2 {
    const st = stateRef.current;
    // Convert mouse-screen coords back to world coords.
    const mx = (st.mouseScreen.x - VIEW_W / 2) / st.zoom + st.cameraX;
    const my = (st.mouseScreen.y - VIEW_H / 2) / st.zoom + st.cameraY;
    const dx = mx - cellPos.x;
    const dy = my - cellPos.y;
    const m = Math.hypot(dx, dy) || 1;
    return { x: dx / m, y: dy / m };
  }

  function splitPlayer() {
    const st = stateRef.current;
    const playerCells = st.cells.filter((c) => c.isPlayer && c.alive);
    if (playerCells.length === 0) return;
    if (playerCells.length >= MAX_OWNER_CELLS) return;
    let didAny = false;
    // Iterate over a snapshot — splitting mutates the cells array.
    for (const c of playerCells.slice()) {
      if (c.r < SPLIT_MIN_R) continue;
      if (st.cells.filter((x) => x.ownerId === c.ownerId && x.alive).length >= MAX_OWNER_CELLS) break;
      const half = c.r / Math.SQRT2; // mass conservation: r → r/√2 each
      c.r = half;
      c.mergeAt = st.elapsed + SPLIT_MERGE_COOLDOWN;
      const dir = aimDirFromMouse(c.pos);
      const newCell: Cell = {
        ownerId: c.ownerId,
        isPlayer: c.isPlayer,
        pos: { x: c.pos.x + dir.x * c.r, y: c.pos.y + dir.y * c.r },
        vel: { x: dir.x * SPLIT_LAUNCH_SPEED, y: dir.y * SPLIT_LAUNCH_SPEED },
        r: half,
        hue: c.hue,
        alive: true,
        mergeAt: st.elapsed + SPLIT_MERGE_COOLDOWN,
      };
      st.cells.push(newCell);
      didAny = true;
    }
    if (didAny) {
      Sfx.boost();
      const playerLive = st.cells.filter((c) => c.isPlayer && c.alive).length;
      setCellCount(playerLive);
    }
  }

  function ejectPlayerMass() {
    const st = stateRef.current;
    const playerCells = st.cells.filter((c) => c.isPlayer && c.alive);
    let didAny = false;
    for (const c of playerCells) {
      if (c.r < EJECT_MIN_R) continue;
      // Subtract a small disc's mass; floor at base radius so we
      // can't shrink ourselves into food.
      const newR = Math.sqrt(Math.max(BASE_R * BASE_R, c.r * c.r - EJECT_MASS_R * EJECT_MASS_R));
      if (newR === c.r) continue;
      const dir = aimDirFromMouse(c.pos);
      const ejectR = EJECT_MASS_R;
      const e: Eject = {
        pos: {
          x: c.pos.x + dir.x * (c.r + ejectR + 2),
          y: c.pos.y + dir.y * (c.r + ejectR + 2),
        },
        vel: { x: dir.x * EJECT_SPEED, y: dir.y * EJECT_SPEED },
        r: ejectR,
        hue: c.hue,
        ownerId: c.ownerId,
        ignoreUntil: st.elapsed + 0.5,
      };
      st.ejects.push(e);
      c.r = newR;
      didAny = true;
    }
    if (didAny) Sfx.click();
  }

  // -------------------------------------------------------------------------
  // Bot AI — basic but multi-cell-aware. A bot looks at the closest
  // threat (any cell of any other owner big enough to eat it) and the
  // closest prey (anything it can eat including food + ejects). It
  // also avoids viruses if it's bigger than them.
  // -------------------------------------------------------------------------

  function updateBots(st: State, dt: number, now: number) {
    for (const c of st.cells) {
      if (c.isPlayer || !c.alive || !c.ai) continue;
      let preyTarget: Vec2 | null = null;
      let preyD = Infinity;
      let threat: Cell | null = null;
      let threatD = Infinity;

      for (const other of st.cells) {
        if (other === c || !other.alive) continue;
        if (other.ownerId === c.ownerId) continue; // don't chase yourself
        const d2 =
          (c.pos.x - other.pos.x) ** 2 + (c.pos.y - other.pos.y) ** 2;
        if (other.r > c.r * EAT_RATIO && d2 < threatD && d2 < 600 * 600) {
          threat = other;
          threatD = d2;
        } else if (
          c.r > other.r * EAT_RATIO &&
          d2 < preyD &&
          d2 < 500 * 500
        ) {
          preyTarget = other.pos;
          preyD = d2;
        }
      }
      // Food + ejects (treat ejects as juicy food)
      for (const f of st.food) {
        const d2 = (c.pos.x - f.pos.x) ** 2 + (c.pos.y - f.pos.y) ** 2;
        if (d2 < preyD && d2 < 380 * 380) {
          preyTarget = f.pos;
          preyD = d2;
        }
      }
      for (const e of st.ejects) {
        const d2 = (c.pos.x - e.pos.x) ** 2 + (c.pos.y - e.pos.y) ** 2;
        if (d2 < preyD && d2 < 420 * 420) {
          preyTarget = e.pos;
          preyD = d2;
        }
      }
      // Virus avoidance — bigger than virus = run away from it.
      let virusAvoid: Vec2 | null = null;
      let virusD = Infinity;
      for (const v of st.viruses) {
        if (c.r <= VIRUS_R * 1.05) continue;
        const d2 = (c.pos.x - v.pos.x) ** 2 + (c.pos.y - v.pos.y) ** 2;
        if (d2 < (VIRUS_R + c.r + 30) ** 2 && d2 < virusD) {
          virusAvoid = v.pos;
          virusD = d2;
        }
      }

      let tx = c.pos.x;
      let ty = c.pos.y;
      if (threat) {
        tx = c.pos.x - (threat.pos.x - c.pos.x);
        ty = c.pos.y - (threat.pos.y - c.pos.y);
      } else if (virusAvoid) {
        tx = c.pos.x - (virusAvoid.x - c.pos.x);
        ty = c.pos.y - (virusAvoid.y - c.pos.y);
      } else if (preyTarget) {
        tx = preyTarget.x;
        ty = preyTarget.y;
      } else {
        if (now / 1000 > c.ai.wanderUntil) {
          c.ai.wanderUntil = now / 1000 + 2 + Math.random() * 3;
          c.ai.tx = rng(120, WORLD - 120);
          c.ai.ty = rng(120, WORLD - 120);
        }
        tx = c.ai.tx;
        ty = c.ai.ty;
      }

      const tdx = tx - c.pos.x;
      const tdy = ty - c.pos.y;
      const td = Math.hypot(tdx, tdy);
      const maxSpd = BASE_SPEED * 0.9 * Math.sqrt(BASE_R / c.r);
      if (td > 4) {
        c.vel.x = (tdx / td) * maxSpd;
        c.vel.y = (tdy / td) * maxSpd;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Main loop
  // -------------------------------------------------------------------------

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      const live =
        startedRef.current && !pausedRef.current && !overRef.current;
      const playerCells = st.cells.filter((c) => c.isPlayer && c.alive);

      if (live && playerCells.length > 0) {
        st.elapsed += dt;

        // ----- Player input → velocity for every player cell -----
        for (const c of playerCells) {
          const screenX = (c.pos.x - st.cameraX) * st.zoom + VIEW_W / 2;
          const screenY = (c.pos.y - st.cameraY) * st.zoom + VIEW_H / 2;
          const dx = st.mouseScreen.x - screenX;
          const dy = st.mouseScreen.y - screenY;
          const d = Math.hypot(dx, dy);
          const maxSpeed = BASE_SPEED * Math.sqrt(BASE_R / c.r);
          if (d > 4) {
            const intensity = Math.min(1, d / 220);
            c.vel.x = (dx / d) * maxSpeed * intensity;
            c.vel.y = (dy / d) * maxSpeed * intensity;
          } else {
            c.vel.x *= 0.85;
            c.vel.y *= 0.85;
          }
        }

        updateBots(st, dt, now);

        // ----- Move cells, clamp to world -----
        for (const c of st.cells) {
          if (!c.alive) continue;
          c.pos.x += c.vel.x * dt;
          c.pos.y += c.vel.y * dt;
          c.pos.x = Math.max(c.r, Math.min(WORLD - c.r, c.pos.x));
          c.pos.y = Math.max(c.r, Math.min(WORLD - c.r, c.pos.y));
        }

        // ----- Move ejects (with friction) and turn into food when slow -----
        for (let i = st.ejects.length - 1; i >= 0; i--) {
          const e = st.ejects[i];
          e.pos.x += e.vel.x * dt;
          e.pos.y += e.vel.y * dt;
          e.vel.x *= Math.exp(-EJECT_FRICTION * dt);
          e.vel.y *= Math.exp(-EJECT_FRICTION * dt);
          // Clamp inside world
          e.pos.x = Math.max(e.r, Math.min(WORLD - e.r, e.pos.x));
          e.pos.y = Math.max(e.r, Math.min(WORLD - e.r, e.pos.y));
          const speed = Math.hypot(e.vel.x, e.vel.y);
          if (speed < 8) {
            // Convert into a food pellet — slightly bigger than normal so
            // the player visibly benefits from feeding viruses, etc.
            st.food.push({
              pos: { ...e.pos },
              r: e.r * 0.9,
              hue: e.hue,
            });
            st.ejects.splice(i, 1);
          }
        }

        // ----- Cells eat food -----
        for (const c of st.cells) {
          if (!c.alive) continue;
          for (let i = st.food.length - 1; i >= 0; i--) {
            const f = st.food[i];
            const d2 = (c.pos.x - f.pos.x) ** 2 + (c.pos.y - f.pos.y) ** 2;
            if (d2 < c.r * c.r) {
              st.food.splice(i, 1);
              c.r = combineRadii(c.r, f.r);
              if (c.isPlayer) {
                setScore((s) => s + Math.round(f.r));
                Sfx.pickup();
              }
            }
          }
        }
        while (st.food.length < FOOD_COUNT) st.food.push(makeFood());

        // ----- Cells eat ejects -----
        for (const c of st.cells) {
          if (!c.alive) continue;
          for (let i = st.ejects.length - 1; i >= 0; i--) {
            const e = st.ejects[i];
            if (e.ownerId === c.ownerId && st.elapsed < e.ignoreUntil) continue;
            const d2 = (c.pos.x - e.pos.x) ** 2 + (c.pos.y - e.pos.y) ** 2;
            if (d2 < c.r * c.r) {
              st.ejects.splice(i, 1);
              c.r = combineRadii(c.r, e.r);
              if (c.isPlayer) {
                setScore((s) => s + Math.round(e.r * 1.2));
                Sfx.pickup();
              }
            }
          }
        }

        // ----- Cells eat cells (cross-owner only) -----
        for (let i = 0; i < st.cells.length; i++) {
          const a = st.cells[i];
          if (!a.alive) continue;
          for (let j = 0; j < st.cells.length; j++) {
            if (i === j) continue;
            const b = st.cells[j];
            if (!b.alive) continue;
            if (a.ownerId === b.ownerId) continue;
            if (a.r <= b.r * EAT_RATIO) continue;
            const d = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
            if (d < a.r - b.r * 0.6) {
              a.r = combineRadii(a.r, b.r);
              b.alive = false;
              if (a.isPlayer) {
                setScore((s) => s + Math.round(b.r * 5));
                Sfx.bigPickup();
              }
            }
          }
        }

        // ----- Same-owner cells merge once cooldown has elapsed -----
        const ownerGroups = new Map<string, Cell[]>();
        for (const c of st.cells) {
          if (!c.alive) continue;
          const arr = ownerGroups.get(c.ownerId) ?? [];
          arr.push(c);
          ownerGroups.set(c.ownerId, arr);
        }
        for (const group of ownerGroups.values()) {
          if (group.length < 2) continue;
          // Try to fuse pairs that overlap and have both expired
          // their merge cooldown. Iterate by index because mutating
          // alive flags as we go.
          for (let i = 0; i < group.length; i++) {
            const a = group[i];
            if (!a.alive) continue;
            if (st.elapsed < a.mergeAt) continue;
            for (let j = i + 1; j < group.length; j++) {
              const b = group[j];
              if (!b.alive) continue;
              if (st.elapsed < b.mergeAt) continue;
              const d = Math.hypot(
                a.pos.x - b.pos.x,
                a.pos.y - b.pos.y,
              );
              if (d < (a.r + b.r) * 0.65) {
                a.r = combineRadii(a.r, b.r);
                a.pos.x = (a.pos.x + b.pos.x) / 2;
                a.pos.y = (a.pos.y + b.pos.y) / 2;
                b.alive = false;
              }
            }
          }
        }

        // ----- Virus collisions -----
        // A cell that's bigger than the virus shatters into VIRUS_SHARDS pieces;
        // smaller cells slide past safely. The virus dies after the pop and
        // a fresh one spawns elsewhere.
        for (let vi = st.viruses.length - 1; vi >= 0; vi--) {
          const v = st.viruses[vi];
          let popped = false;
          for (const c of st.cells) {
            if (!c.alive) continue;
            if (c.r <= VIRUS_R * 1.05) continue; // small enough → safe
            const d = Math.hypot(c.pos.x - v.pos.x, c.pos.y - v.pos.y);
            if (d < c.r - VIRUS_R * 0.3) {
              // Shatter — divide mass between shards. We cap total
              // owner cells at MAX_OWNER_CELLS to avoid runaway chains.
              const liveOwners = st.cells.filter(
                (x) => x.alive && x.ownerId === c.ownerId,
              ).length;
              const shards = Math.max(
                2,
                Math.min(VIRUS_SHARDS, MAX_OWNER_CELLS - liveOwners + 1),
              );
              const shardR = c.r / Math.sqrt(shards);
              c.r = shardR;
              c.mergeAt = st.elapsed + SPLIT_MERGE_COOLDOWN;
              for (let s = 1; s < shards; s++) {
                const ang = (s / shards) * Math.PI * 2 + Math.random() * 0.4;
                const launch = SPLIT_LAUNCH_SPEED * 0.6;
                st.cells.push({
                  ownerId: c.ownerId,
                  isPlayer: c.isPlayer,
                  pos: {
                    x: c.pos.x + Math.cos(ang) * c.r * 0.5,
                    y: c.pos.y + Math.sin(ang) * c.r * 0.5,
                  },
                  vel: {
                    x: Math.cos(ang) * launch,
                    y: Math.sin(ang) * launch,
                  },
                  r: shardR,
                  hue: c.hue,
                  alive: true,
                  mergeAt: st.elapsed + SPLIT_MERGE_COOLDOWN,
                });
              }
              if (c.isPlayer) Sfx.error();
              popped = true;
              break;
            }
          }
          if (popped) {
            st.viruses.splice(vi, 1);
            // Spawn a replacement off-camera so it doesn't pop right
            // back onto the player's screen.
            for (let attempt = 0; attempt < 6; attempt++) {
              const fresh = makeVirus();
              const dCam = Math.hypot(
                fresh.pos.x - st.cameraX,
                fresh.pos.y - st.cameraY,
              );
              if (dCam > 600 || attempt === 5) {
                st.viruses.push(fresh);
                break;
              }
            }
          }
        }

        // ----- Respawn dead bots so the arena stays populated -----
        const aliveBotOwners = new Set(
          st.cells
            .filter((c) => !c.isPlayer && c.alive)
            .map((c) => c.ownerId),
        );
        let spawnedThisFrame = 0;
        while (aliveBotOwners.size < BOT_COUNT && spawnedThisFrame < 2) {
          const fresh = makeBotCell(st.nextEntityNumber++);
          // Spawn off-camera if possible.
          for (let attempt = 0; attempt < 6; attempt++) {
            const sx = rng(120, WORLD - 120);
            const sy = rng(120, WORLD - 120);
            const d = Math.hypot(sx - st.cameraX, sy - st.cameraY);
            if (d > 700 || attempt === 5) {
              fresh.pos.x = sx;
              fresh.pos.y = sy;
              break;
            }
          }
          st.cells.push(fresh);
          aliveBotOwners.add(fresh.ownerId);
          spawnedThisFrame++;
        }

        // ----- Camera follows player centroid; zoom from total mass -----
        const livePlayer = st.cells.filter((c) => c.isPlayer && c.alive);
        if (livePlayer.length > 0) {
          let cx = 0;
          let cy = 0;
          let totalMass = 0;
          let maxR = 0;
          for (const c of livePlayer) {
            const m = c.r * c.r;
            cx += c.pos.x * m;
            cy += c.pos.y * m;
            totalMass += m;
            if (c.r > maxR) maxR = c.r;
          }
          cx /= totalMass;
          cy /= totalMass;
          const totalR = Math.sqrt(totalMass);
          const zoomTarget = Math.max(
            0.4,
            Math.min(1.2, Math.sqrt(BASE_R / totalR)),
          );
          const k = 1 - Math.exp(-dt * 6);
          st.zoom += (zoomTarget - st.zoom) * k;
          st.cameraX += (cx - st.cameraX) * k;
          st.cameraY += (cy - st.cameraY) * k;

          // HUD updates
          setSize(Math.round(maxR));
          const biggerRanks = countLargerOwners(st, totalR);
          setRank(biggerRanks + 1);
          setCellCount(livePlayer.length);
        }

        // ----- Game over check (no live player cells) -----
        if (livePlayer.length === 0 && !overRef.current) {
          setOver(true);
          Sfx.gameOver();
          setScore((finalScore) => {
            setBest((b) => {
              const nb = Math.max(b, finalScore);
              try {
                localStorage.setItem("nexplay:agma-best", String(nb));
              } catch {
                // private mode
              }
              return nb;
            });
            return finalScore;
          });
        }
      }

      // ----- DRAW -----
      drawScene(ctx, st);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#3a0d05] to-[#0c0c0e] p-2 sm:p-3">
      <div className="shrink-0 flex items-center justify-center gap-2 mb-2 text-white text-xs sm:text-sm flex-wrap">
        <Stat label="Score" value={score} accent />
        <Stat label="Size" value={size} />
        <Stat label="Rank" value={`#${rank}`} />
        <Stat label="Cells" value={cellCount} />
        <Stat label="Best" value={best} />
        <SoundToggle />
        {started && !over && (
          <PauseToggle paused={paused} onClick={togglePause} />
        )}
      </div>

      <div className="flex-1 min-h-0 w-full flex items-center justify-center">
        <div
          ref={wrapRef}
          className="relative h-full max-w-full touch-none"
          style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
        >
          <canvas
            ref={canvasRef}
            width={VIEW_W}
            height={VIEW_H}
            className="absolute inset-0 w-full h-full block rounded-xl border border-white/10 cursor-crosshair"
          />
          {!started && !over && (
            <GameOverlay
              icon="⚡"
              title="Agma"
              subtitle={
                <>
                  Mouse to steer, eat anything ~18% smaller than you.{" "}
                  <b>Space</b> to split a big cell forward, <b>W</b> to spit
                  mass. Avoid the green spiky <b>viruses</b> when you&apos;re big
                  — they&apos;ll shatter you on contact.
                </>
              }
              primary={{ label: "▶ Play", onClick: start }}
            />
          )}
          {paused && started && !over && (
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
          {over && (
            <GameOverlay
              icon="💀"
              title="You got eaten"
              subtitle={`Size ${size} · Rank #${rank} · Score ${score}`}
              primary={{ label: "Play again", onClick: start }}
            >
              <ScoreStatus gameSlug="agma" status={submitStatus} />
            </GameOverlay>
          )}
        </div>
      </div>
      <div className="shrink-0 mt-2 text-[11px] text-white/60 text-center">
        Mouse to steer ·{" "}
        <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono">Space</kbd>{" "}
        split ·{" "}
        <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono">W</kbd>{" "}
        eject mass ·{" "}
        <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono">P</kbd>{" "}
        pause
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drawing — separated out so the loop body stays readable
// ---------------------------------------------------------------------------

function drawScene(ctx: CanvasRenderingContext2D, st: State) {
  ctx.fillStyle = "#0a0a18";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.save();
  ctx.translate(VIEW_W / 2, VIEW_H / 2);
  ctx.scale(st.zoom, st.zoom);
  ctx.translate(-st.cameraX, -st.cameraY);

  const vw = VIEW_W / st.zoom;
  const vh = VIEW_H / st.zoom;
  const minX = st.cameraX - vw / 2 - 60;
  const maxX = st.cameraX + vw / 2 + 60;
  const minY = st.cameraY - vh / 2 - 60;
  const maxY = st.cameraY + vh / 2 + 60;

  // Soft warm radial backdrop — matches the catalog gradient.
  const bg = ctx.createRadialGradient(
    WORLD / 2,
    WORLD / 2,
    WORLD * 0.2,
    WORLD / 2,
    WORLD / 2,
    WORLD * 0.7,
  );
  bg.addColorStop(0, "rgba(239,68,68,0.06)");
  bg.addColorStop(1, "rgba(0,0,0,0.4)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WORLD, WORLD);

  // Grid
  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  ctx.lineWidth = 1 / st.zoom;
  const grid = 80;
  const gMinX = Math.max(0, minX);
  const gMaxX = Math.min(WORLD, maxX);
  const gMinY = Math.max(0, minY);
  const gMaxY = Math.min(WORLD, maxY);
  const sx = Math.floor(gMinX / grid) * grid;
  const sy = Math.floor(gMinY / grid) * grid;
  for (let x = sx; x <= gMaxX; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, gMinY);
    ctx.lineTo(x, gMaxY);
    ctx.stroke();
  }
  for (let y = sy; y <= gMaxY; y += grid) {
    ctx.beginPath();
    ctx.moveTo(gMinX, y);
    ctx.lineTo(gMaxX, y);
    ctx.stroke();
  }

  // World border — yellow to match the gradient endpoint.
  ctx.strokeStyle = "rgba(250,204,21,0.5)";
  ctx.lineWidth = 4 / st.zoom;
  ctx.strokeRect(0, 0, WORLD, WORLD);

  // Food
  for (const f of st.food) {
    if (f.pos.x < minX || f.pos.x > maxX || f.pos.y < minY || f.pos.y > maxY)
      continue;
    ctx.fillStyle = `hsl(${f.hue}, 85%, 62%)`;
    ctx.beginPath();
    ctx.arc(f.pos.x, f.pos.y, f.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ejects (look like food in flight, slightly brighter)
  for (const e of st.ejects) {
    if (e.pos.x < minX || e.pos.x > maxX || e.pos.y < minY || e.pos.y > maxY)
      continue;
    ctx.fillStyle = `hsl(${e.hue}, 90%, 70%)`;
    ctx.beginPath();
    ctx.arc(e.pos.x, e.pos.y, e.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Viruses — green spiky stars
  for (const v of st.viruses) {
    if (v.pos.x < minX || v.pos.x > maxX || v.pos.y < minY || v.pos.y > maxY)
      continue;
    drawVirus(ctx, v.pos.x, v.pos.y, v.r, st.zoom);
  }

  // Cells — sort by radius so smaller render under larger.
  const visible = st.cells
    .filter(
      (c) =>
        c.alive &&
        c.pos.x + c.r > minX &&
        c.pos.x - c.r < maxX &&
        c.pos.y + c.r > minY &&
        c.pos.y - c.r < maxY,
    )
    .sort((a, b) => a.r - b.r);
  for (const c of visible) {
    const grad = ctx.createRadialGradient(
      c.pos.x - c.r * 0.25,
      c.pos.y - c.r * 0.25,
      c.r * 0.1,
      c.pos.x,
      c.pos.y,
      c.r,
    );
    grad.addColorStop(0, `hsl(${c.hue}, 85%, 72%)`);
    grad.addColorStop(1, `hsl(${c.hue}, 75%, 42%)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(c.pos.x, c.pos.y, c.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = c.isPlayer
      ? "rgba(255,255,255,0.85)"
      : `hsl(${c.hue}, 80%, 30%)`;
    ctx.lineWidth = (c.isPlayer ? 4 : 3) / st.zoom;
    ctx.beginPath();
    ctx.arc(c.pos.x, c.pos.y, c.r, 0, Math.PI * 2);
    ctx.stroke();
    if (c.r >= 20) {
      const fontPx = Math.max(13, c.r * 0.42);
      ctx.font = `bold ${fontPx}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.85)";
      ctx.shadowBlur = 4;
      ctx.fillStyle = "white";
      const name = c.isPlayer ? "You" : c.ownerId.replace("b", "Bot ");
      ctx.fillText(name, c.pos.x, c.pos.y - fontPx * 0.1);
      ctx.shadowBlur = 0;
      ctx.font = `bold ${fontPx * 0.65}px system-ui`;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillText(
        String(Math.round(c.r * c.r)),
        c.pos.x,
        c.pos.y + fontPx * 0.7,
      );
    }
  }

  ctx.restore();

  // Minimap
  const mmW = 130;
  const mmH = 130;
  const mmX = VIEW_W - mmW - 10;
  const mmY = 10;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(mmX, mmY, mmW, mmH);
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.strokeRect(mmX + 0.5, mmY + 0.5, mmW - 1, mmH - 1);
  const ms = mmW / WORLD;
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 1;
  ctx.strokeRect(
    mmX + (st.cameraX - vw / 2) * ms,
    mmY + (st.cameraY - vh / 2) * ms,
    vw * ms,
    vh * ms,
  );
  // Viruses on minimap
  for (const v of st.viruses) {
    ctx.fillStyle = "rgba(74,222,128,0.85)";
    const r = Math.max(1.2, v.r * ms);
    ctx.beginPath();
    ctx.arc(mmX + v.pos.x * ms, mmY + v.pos.y * ms, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Cells
  for (const c of st.cells) {
    if (!c.alive) continue;
    ctx.fillStyle = c.isPlayer ? "#facc15" : `hsl(${c.hue}, 70%, 60%)`;
    const r = Math.max(1.6, c.r * ms);
    ctx.beginPath();
    ctx.arc(mmX + c.pos.x * ms, mmY + c.pos.y * ms, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Draw a virus as a green spiky disc — outer ring of 14 small bumps. */
function drawVirus(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  zoom: number,
) {
  const spikes = 16;
  const inner = r * 0.85;
  const outer = r * 1.15;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const ang = (i / (spikes * 2)) * Math.PI * 2;
    const rad = i % 2 === 0 ? outer : inner;
    const x = cx + Math.cos(ang) * rad;
    const y = cy + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  const grad = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
  grad.addColorStop(0, "rgba(74,222,128,0.95)");
  grad.addColorStop(1, "rgba(22,101,52,0.95)");
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = "rgba(20,83,45,0.95)";
  ctx.lineWidth = 2 / zoom;
  ctx.stroke();
}

/** Count distinct owners whose total mass-radius is bigger than the
 *  player's. Used to derive the player's leaderboard rank. */
function countLargerOwners(st: State, playerR: number): number {
  const ownerR = new Map<string, number>();
  for (const c of st.cells) {
    if (!c.alive || c.isPlayer) continue;
    const cur = ownerR.get(c.ownerId) ?? 0;
    ownerR.set(c.ownerId, cur + c.r * c.r);
  }
  let count = 0;
  for (const m of ownerR.values()) {
    if (Math.sqrt(m) > playerR) count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Tiny HUD pill component — same shape as Agar's
// ---------------------------------------------------------------------------

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <span
      className={`px-3 py-1 rounded-lg ${
        accent
          ? "bg-amber-500/20 border border-amber-400/40 text-amber-200"
          : "bg-white/10"
      }`}
    >
      <span className="text-[10px] uppercase tracking-wider opacity-60 mr-1.5">
        {label}
      </span>
      <b>{value}</b>
    </span>
  );
}
