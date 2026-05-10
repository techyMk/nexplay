"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useKeyboard } from "../useGameLoop";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";
import { GameOverlay, PauseToggle } from "@/components/games/GameOverlay";
import { SoundToggle } from "@/components/SoundToggle";
import { Sfx } from "@/lib/sound";

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
  /** Tells the renderer which hazard layer to draw + collide. */
  hazard: "none" | "spike" | "ice";
};

type LevelDef = { theme: LevelTheme; grid: number[][] };

const LEVELS: LevelDef[] = [
  // -------------------------------------------------------------
  // Level 1 — The Cavern. Just walls + treasure, no hazards. Acts
  // as the tutorial layout: get used to the cave aesthetic and the
  // explorer sprite before anything tries to hurt you.
  // -------------------------------------------------------------
  {
    theme: {
      name: "The Cavern",
      blurb: "Find five glints in the rock and head for the green exit.",
      wall: "#2a1f12",
      floor: "#15110a",
      accent: "#facc15",
      hazard: "none",
    },
    grid: [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 1],
      [1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1],
      [1, 0, 1, 2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
      [1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 0, 0, 0, 0, 1, 0, 1, 0, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 0, 0, 1],
      [1, 0, 0, 0, 2, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1],
      [1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0, 0, 0, 1, 0, 1],
      [1, 0, 1, 0, 0, 0, 1, 0, 1, 2, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1],
      [1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1],
      [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 3, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ],
  },
  // -------------------------------------------------------------
  // Level 2 — Spike Pit Ruins. Floor tiles marked `4` cycle between
  // hidden (safe) and extended (dangerous). Stepping on an extended
  // spike costs a life. Theme: cold stone ruins, red accent.
  // -------------------------------------------------------------
  {
    theme: {
      name: "Spike Pit Ruins",
      blurb:
        "Spikes pop up and retract on a rhythm — wait for them to drop, then run.",
      wall: "#2e2e3a",
      floor: "#181822",
      accent: "#ef4444",
      hazard: "spike",
    },
    grid: [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 0, 4, 0, 0, 4, 0, 2, 0, 4, 0, 0, 4, 0, 0, 0, 2, 1],
      [1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1],
      [1, 0, 4, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 1],
      [1, 0, 1, 1, 1, 1, 1, 4, 1, 1, 1, 4, 1, 1, 1, 1, 1, 1, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 2, 0, 0, 0, 0, 0, 1],
      [1, 1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 1, 1, 4, 1, 1, 1, 0, 1, 1, 4, 1, 1, 1, 1, 1, 1, 0, 1],
      [1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 2, 0, 0, 1],
      [1, 0, 1, 1, 1, 1, 4, 1, 1, 1, 1, 1, 4, 1, 1, 1, 1, 1, 0, 1],
      [1, 0, 0, 0, 4, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ],
  },
  // -------------------------------------------------------------
  // Level 3 — Frozen Vault. Every floor tile is ice (`5`). Player
  // steering becomes a *target* velocity that the body lerps toward
  // very slowly, so you skate around the maze and have to plan
  // momentum for every turn. Theme: deep blue stone, cyan accent.
  // -------------------------------------------------------------
  {
    theme: {
      name: "Frozen Vault",
      blurb:
        "The floor is solid ice. Plan your turns — you don't stop on a dime.",
      wall: "#1f3a55",
      floor: "#0d2a3a",
      accent: "#22d3ee",
      hazard: "ice",
    },
    grid: [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 5, 5, 5, 5, 1, 5, 5, 5, 5, 5, 5, 1, 5, 5, 5, 2, 5, 5, 1],
      [1, 5, 1, 1, 5, 1, 5, 1, 1, 1, 1, 5, 1, 5, 1, 1, 1, 1, 5, 1],
      [1, 5, 1, 2, 5, 5, 5, 1, 5, 5, 5, 5, 5, 5, 5, 5, 5, 1, 5, 1],
      [1, 5, 1, 1, 1, 1, 1, 1, 5, 1, 1, 1, 1, 1, 1, 1, 5, 1, 5, 1],
      [1, 5, 5, 5, 5, 5, 5, 5, 5, 1, 2, 5, 5, 5, 5, 1, 5, 1, 5, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 5, 1, 5, 5, 5, 1],
      [1, 5, 5, 5, 2, 5, 1, 5, 5, 5, 5, 5, 5, 1, 5, 1, 1, 1, 5, 1],
      [1, 5, 1, 1, 1, 5, 1, 5, 1, 1, 1, 1, 5, 1, 5, 5, 5, 1, 5, 1],
      [1, 5, 1, 5, 5, 5, 1, 5, 1, 2, 5, 1, 5, 1, 1, 1, 5, 1, 5, 1],
      [1, 5, 1, 5, 1, 1, 1, 5, 1, 1, 5, 1, 5, 5, 5, 5, 5, 1, 5, 1],
      [1, 5, 5, 5, 1, 5, 5, 5, 5, 5, 5, 1, 1, 1, 1, 1, 1, 1, 5, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 5, 5, 5, 5, 5, 5, 5, 5, 3, 1],
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
};
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
        });
      }
    }
  }
  return { grid, treasures, theme: level.theme };
}

type Phase = "ready" | "playing" | "level-clear" | "won" | "dead";

function makeFreshState() {
  const loaded = loadLevel(0);
  return {
    levelIdx: 0,
    grid: loaded.grid,
    theme: loaded.theme,
    treasures: loaded.treasures,
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
      total: stateRef.current.treasures.length,
    });
  }, []);

  const togglePause = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    setPaused((p) => !p);
  }, []);

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
    setLevelLoot({ got: 0, total: loaded.treasures.length });
    setPhase("playing");
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
        // almost instantly so steering feels precise.
        const cellAtFeet =
          st.grid[Math.floor(st.py)]?.[Math.floor(st.px)] ?? 0;
        const onIce = cellAtFeet === 5;
        const accel = onIce ? 1.5 : 28;
        const lerpK = 1 - Math.exp(-dt * accel);
        st.vx += (targetVx - st.vx) * lerpK;
        st.vy += (targetVy - st.vy) * lerpK;

        // Apply velocity per axis so we slide along walls
        if (!tryMoveAxis(st.vx * dt, 0)) st.vx = 0;
        if (!tryMoveAxis(0, st.vy * dt)) st.vy = 0;
        checkPickups();

        // Hazard: spike trap (active for SPIKE_ACTIVE_RATIO of cycle)
        if (st.theme.hazard === "spike") {
          const phaseInCycle =
            (st.levelElapsed % SPIKE_PERIOD) / SPIKE_PERIOD;
          const spikeActive = phaseInCycle < SPIKE_ACTIVE_RATIO;
          if (spikeActive) {
            const cell =
              st.grid[Math.floor(st.py)]?.[Math.floor(st.px)] ?? 0;
            if (cell === 4) damagePlayer();
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
      // Themed backdrop
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, st.theme.floor);
      bg.addColorStop(1, "#000");
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
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#1a1208] to-[#0b0d12] p-2 sm:p-3">
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
      <div className="shrink-0 mt-2 text-[11px] text-white/60 text-center">
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
