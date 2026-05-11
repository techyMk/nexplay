"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useKeyboard } from "../useGameLoop";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";
import { GameOverlay, PauseToggle } from "@/components/games/GameOverlay";
import { SoundToggle } from "@/components/SoundToggle";
import { TouchPad } from "@/components/games/TouchPad";
import { Sfx, createEngine, type Engine } from "@/lib/sound";

// Canvas + road geometry
const W = 480;
const H = 700;
const ROAD_LEFT_BASE = 60;
const ROAD_RIGHT_BASE = W - 60;
const PLAYER_Y = H - 130;
const CAR_W = 44;
const CAR_H = 70;

// Speed model
const SPEED_BASE = 200;
const SPEED_MIN = 140;
const SPEED_MAX = 580;
const ACCEL = 110; // px/s/s when holding ↑
const COAST_DECEL = 32; // gradual decay if neither ↑ nor ↓
const BRAKE_DECEL = 280; // strong decel when holding ↓

// Steering — smooth, lerp toward a target lateral velocity
const STEER_SPEED = 360;

// Score tuning
const SCORE_PER_PX = 0.012; // distance scoring (speed * dt → px → score)
const COIN_VALUE = 60;
const NEAR_MISS_BASE = 25;
const NEAR_MISS_PER_COMBO = 25;
const COMBO_DECAY_SECONDS = 4;
const NEAR_MISS_LATERAL_PX = 14; // how close past the bumper counts as a near-miss
const MILESTONE_STEP = 1000;

// Event tuning
const EVENT_FIRST_AT = 14;
const EVENT_GAP_MIN = 11;
const EVENT_GAP_RANGE = 7;
const EVENT_WARNING_SECONDS = 1.4;

// Engine / gearbox
/** Number of speed-band "gears" — each shift gives a satisfying
 *  pitch dip + thud. Five matches the feel of a real gearbox. */
const GEAR_COUNT = 5;
/** Per-gear base frequency lift (Hz). Each successive gear sits a
 *  little higher than the last so even the dip after a shift still
 *  reads as climbing through the powerband. */
const GEAR_BASE_LIFT = 8;
/** Frequency span of each gear in Hz — the engine note rises this
 *  much from the bottom to the top of a single gear. */
const GEAR_FREQ_SPAN = 70;
/** Spawn-time check: how much *gap* (in pixels) we want between the
 *  bumpers of two vehicles when one is spawning. */
const SPAWN_VERTICAL_BUFFER = 24;
const SPAWN_LATERAL_BUFFER = 6;
/** Run-time follow distance — when a vehicle's leader (same lane,
 *  ahead) is closer than this gap, the rear vehicle clamps to the
 *  leader's speed instead of overrunning it. */
const FOLLOW_BUFFER = 60;

type EventKind = "normal" | "rush" | "tunnel" | "slick";

type VehicleKind = "sedan" | "truck" | "sports" | "bus" | "motorbike";

type Obstacle = {
  kind: VehicleKind;
  x: number;
  y: number;
  w: number;
  h: number;
  hue: number;
  /** Lateral drift (rush hour gives some traffic a wobble). */
  vx: number;
  /** Forward speed in px/s (same direction as the player). Slower
   *  vehicles drift down toward the player from above; faster ones
   *  spawn behind and overtake from below. */
  forwardSpeed: number;
  passed: boolean; // already crossed the player's y line — used for near-miss scoring
};

/** Per-kind sizes, spawn weights, and forward-speed ranges. The player
 *  starts at SPEED_BASE (200 px/s); a vehicle with forwardSpeed below
 *  that reads as "in front, going slower"; above it reads as
 *  "overtaking from behind." */
const VEHICLE_DEFS: Record<
  VehicleKind,
  {
    w: number;
    h: number;
    weight: number;
    speedMin: number;
    speedMax: number;
    canWobble: boolean;
    hueChoices: number[];
  }
> = {
  sedan: {
    w: 46,
    h: 74,
    weight: 50,
    speedMin: 60,
    speedMax: 130,
    canWobble: true,
    hueChoices: [0, 35, 200, 280, 130, 320],
  },
  truck: {
    w: 54,
    h: 124,
    weight: 18,
    speedMin: 35,
    speedMax: 70,
    canWobble: false,
    hueChoices: [25, 35, 220], // earthy + cargo-blue
  },
  sports: {
    w: 42,
    h: 70,
    weight: 14,
    speedMin: 130,
    speedMax: 230,
    canWobble: true,
    hueChoices: [0, 50, 280, 200], // bright reds, yellows, purples
  },
  bus: {
    w: 60,
    h: 150,
    weight: 10,
    speedMin: 30,
    speedMax: 55,
    canWobble: false,
    hueChoices: [50, 30, 200], // school yellow, transit orange/blue
  },
  motorbike: {
    w: 22,
    h: 48,
    weight: 8,
    speedMin: 110,
    speedMax: 200,
    canWobble: true,
    hueChoices: [0, 200, 320, 130],
  },
};

function pickVehicleKind(): VehicleKind {
  const total = Object.values(VEHICLE_DEFS).reduce(
    (acc, v) => acc + v.weight,
    0,
  );
  let r = Math.random() * total;
  for (const [k, v] of Object.entries(VEHICLE_DEFS) as [
    VehicleKind,
    (typeof VEHICLE_DEFS)[VehicleKind],
  ][]) {
    r -= v.weight;
    if (r <= 0) return k;
  }
  return "sedan";
}
type Coin = { x: number; y: number; phase: number };
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  r: number;
};
type Skid = { x: number; y: number; life: number };
type Floater = { x: number; y: number; life: number; text: string; hue: number };
type RainDrop = { x: number; y: number; vy: number };

type State = {
  carX: number;
  carY: number;
  carVx: number;
  speed: number;
  topSpeed: number;
  roadOffset: number;
  obstacles: Obstacle[];
  coins: Coin[];
  particles: Particle[];
  skids: Skid[];
  floaters: Floater[];
  rain: RainDrop[];
  spawnTimer: number;
  coinTimer: number;
  elapsed: number;
  scoreFloat: number;
  combo: number;
  comboTimer: number;
  nearMisses: number;
  lastMilestone: number;
  event: EventKind;
  eventEndsAt: number;
  nextEventAt: number;
  warningEvent: Exclude<EventKind, "normal"> | null;
  warningTimer: number;
  bannerTimer: number; // active-event banner stays on briefly
  flashTimer: number;
  shake: number;
  /** Reads as the road's *current* half-width offset from the centre.
   *  In tunnel mode this lerps toward a tighter value so the walls
   *  appear to close in smoothly instead of snapping. */
  roadHalf: number;
};

function rng(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function makeFreshState(): State {
  const halfBase = (ROAD_RIGHT_BASE - ROAD_LEFT_BASE) / 2;
  return {
    carX: W / 2,
    carY: PLAYER_Y,
    carVx: 0,
    speed: SPEED_BASE,
    topSpeed: SPEED_BASE,
    roadOffset: 0,
    obstacles: [],
    coins: [],
    particles: [],
    skids: [],
    floaters: [],
    rain: [],
    spawnTimer: 1.2,
    coinTimer: 2.5,
    elapsed: 0,
    scoreFloat: 0,
    combo: 0,
    comboTimer: 0,
    nearMisses: 0,
    lastMilestone: 0,
    event: "normal",
    eventEndsAt: 0,
    nextEventAt: EVENT_FIRST_AT,
    warningEvent: null,
    warningTimer: 0,
    bannerTimer: 0,
    flashTimer: 0,
    shake: 0,
    roadHalf: halfBase,
  };
}

const EVENT_INFO: Record<
  Exclude<EventKind, "normal">,
  { label: string; emoji: string; duration: number; color: string }
> = {
  rush: {
    label: "RUSH HOUR",
    emoji: "🚦",
    duration: 5,
    color: "#ef4444",
  },
  tunnel: {
    label: "TUNNEL",
    emoji: "🏗️",
    duration: 4,
    color: "#facc15",
  },
  slick: {
    label: "SLICK ROAD",
    emoji: "🌧️",
    duration: 5.5,
    color: "#22d3ee",
  },
};

export default function DriftKing() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keys = useKeyboard();
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [speed, setSpeed] = useState(SPEED_BASE);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState(false);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  // Stats shown on the crash screen
  const [crashStats, setCrashStats] = useState<{
    topSpeed: number;
    nearMisses: number;
    elapsed: number;
  } | null>(null);
  const submitStatus = useSubmitScoreOnGameOver("drift-king", score, over);

  const startedRef = useRef(false);
  startedRef.current = started;
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const overRef = useRef(false);
  overRef.current = over;
  const scoreRef = useRef(0);
  scoreRef.current = score;
  const comboRef = useRef(0);
  comboRef.current = combo;
  const speedRef = useRef(SPEED_BASE);
  speedRef.current = speed;

  const stateRef = useRef<State>(makeFreshState());
  const engineRef = useRef<Engine | null>(null);
  const gearRef = useRef(0);

  useEffect(() => {
    setBest(Number(localStorage.getItem("nexplay:drift-best") || 0));
  }, []);

  const start = useCallback(() => {
    stateRef.current = makeFreshState();
    gearRef.current = 0;
    // Lazily create the engine on the first start — the AudioContext
    // can't be unlocked before a user gesture, and start() is wired to
    // a button click.
    if (!engineRef.current) engineRef.current = createEngine();
    setScore(0);
    setCombo(0);
    setSpeed(SPEED_BASE);
    setOver(false);
    setStarted(true);
    setPaused(false);
    setCrashStats(null);
  }, []);

  // Tear down the engine when the component unmounts so a navigation
  // away from the page doesn't leave the oscillators humming forever.
  useEffect(() => {
    return () => {
      engineRef.current?.stop();
      engineRef.current = null;
    };
  }, []);

  const togglePause = useCallback(() => {
    if (overRef.current || !startedRef.current) return;
    setPaused((p) => !p);
  }, []);

  // Hotkeys for pause / restart from over screen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        e.preventDefault();
        togglePause();
        return;
      }
      if (overRef.current && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        start();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePause, start]);

  // Main loop
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();

    const triggerEvent = (st: State, kind: Exclude<EventKind, "normal">) => {
      st.event = kind;
      st.eventEndsAt = st.elapsed + EVENT_INFO[kind].duration;
      st.bannerTimer = 1.4;
      Sfx.boost();
    };

    const explode = (
      st: State,
      x: number,
      y: number,
      colour: string,
      n: number,
      power = 1,
    ) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (60 + Math.random() * 200) * power;
        st.particles.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 0.7,
          max: 0.7,
          color: colour,
          r: 1.4 + Math.random() * 2.2,
        });
      }
    };

    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      const k = keys.current;
      const live = startedRef.current && !pausedRef.current && !overRef.current;

      // Silence the engine the moment the game isn't live so a paused
      // / crashed / pre-start screen doesn't keep humming.
      if (!live && engineRef.current) {
        engineRef.current.update(60, 0);
      }

      // Camera shake / flash timers must decay every frame, including
      // *after* the crash. If we only decayed inside the `live` block,
      // the crash itself sets shake = 1 → live becomes false next
      // frame → shake stays at 1 forever and the road jitters
      // permanently behind the game-over overlay.
      if (st.flashTimer > 0)
        st.flashTimer = Math.max(0, st.flashTimer - dt * 3);
      if (st.shake > 0) st.shake = Math.max(0, st.shake - dt * 5);

      if (live) {
        st.elapsed += dt;

        // ----- Speed model -----
        if (k.has("ArrowUp") || k.has("w")) {
          st.speed = Math.min(SPEED_MAX, st.speed + ACCEL * dt);
        } else if (k.has("ArrowDown") || k.has("s")) {
          st.speed = Math.max(SPEED_MIN, st.speed - BRAKE_DECEL * dt);
        } else {
          st.speed = Math.max(SPEED_BASE, st.speed - COAST_DECEL * dt);
        }
        if (st.speed > st.topSpeed) st.topSpeed = st.speed;

        // ----- Steering: lerp lateral velocity toward target -----
        // Slick events make the lerp slower so the car drifts.
        let targetVx = 0;
        if (k.has("ArrowLeft") || k.has("a")) targetVx -= STEER_SPEED;
        if (k.has("ArrowRight") || k.has("d")) targetVx += STEER_SPEED;
        const steerK =
          st.event === "slick" ? 1 - Math.exp(-dt * 2.4) : 1 - Math.exp(-dt * 12);
        st.carVx += (targetVx - st.carVx) * steerK;
        st.carX += st.carVx * dt;
        // Skid marks when steering hard
        if (Math.abs(st.carVx) > 220 && Math.random() < 0.5) {
          st.skids.push({
            x: st.carX - 14 + (st.carVx > 0 ? -2 : 2),
            y: st.carY + 24,
            life: 0.9,
          });
          st.skids.push({
            x: st.carX + 14 + (st.carVx > 0 ? -2 : 2),
            y: st.carY + 24,
            life: 0.9,
          });
        }

        // ----- Road width (tunnel narrows the lanes) -----
        const halfBase = (ROAD_RIGHT_BASE - ROAD_LEFT_BASE) / 2;
        const halfTarget = st.event === "tunnel" ? halfBase * 0.62 : halfBase;
        st.roadHalf += (halfTarget - st.roadHalf) * (1 - Math.exp(-dt * 4));
        const roadL = W / 2 - st.roadHalf;
        const roadR = W / 2 + st.roadHalf;
        // Clamp the car inside the (current) road
        const carHalf = CAR_W / 2;
        if (st.carX < roadL + carHalf) {
          st.carX = roadL + carHalf;
          if (st.carVx < 0) st.carVx = 0;
        }
        if (st.carX > roadR - carHalf) {
          st.carX = roadR - carHalf;
          if (st.carVx > 0) st.carVx = 0;
        }

        // ----- Lane-marking scroll -----
        st.roadOffset = (st.roadOffset + st.speed * dt) % 80;

        // ----- Spawn obstacles -----
        const baseSpawn = Math.max(0.32, 1.1 - st.elapsed * 0.012);
        const spawnInterval =
          st.event === "rush" ? baseSpawn * 0.42 : baseSpawn;
        st.spawnTimer -= dt;
        if (st.spawnTimer <= 0) {
          st.spawnTimer = spawnInterval * (0.85 + Math.random() * 0.3);
          const kind = pickVehicleKind();
          const def = VEHICLE_DEFS[kind];
          const fSpeed = rng(def.speedMin, def.speedMax);
          // Faster-than-player traffic spawns from behind (bottom of
          // screen) so it can overtake into view; slower traffic
          // spawns above so the player runs them down.
          const fromBehind = fSpeed > st.speed;
          const startY = fromBehind ? H + def.h / 2 + 10 : -def.h / 2 - 10;
          // Try a handful of x positions before giving up; rejects
          // any spot that would overlap an existing vehicle's bumper
          // box. Without this, spawn could land on top of a slow
          // truck still hanging near the spawn line.
          let chosenX: number | null = null;
          for (let attempt = 0; attempt < 6; attempt++) {
            const candidateX = rng(
              roadL + def.w / 2 + 4,
              roadR - def.w / 2 - 4,
            );
            let conflict = false;
            for (const existing of st.obstacles) {
              const dx = Math.abs(existing.x - candidateX);
              const dy = Math.abs(existing.y - startY);
              if (
                dx < (existing.w + def.w) / 2 + SPAWN_LATERAL_BUFFER &&
                dy < (existing.h + def.h) / 2 + SPAWN_VERTICAL_BUFFER
              ) {
                conflict = true;
                break;
              }
            }
            if (!conflict) {
              chosenX = candidateX;
              break;
            }
          }
          if (chosenX === null) {
            // Couldn't find an empty slot this tick — try again very
            // soon rather than waiting a full interval.
            st.spawnTimer = 0.18;
          } else {
            const wobble =
              def.canWobble && st.event === "rush" && Math.random() < 0.4;
            const hue =
              def.hueChoices[
                Math.floor(Math.random() * def.hueChoices.length)
              ];
            st.obstacles.push({
              kind,
              x: chosenX,
              y: startY,
              w: def.w,
              h: def.h,
              hue,
              vx: wobble ? rng(-50, 50) : 0,
              forwardSpeed: fSpeed,
              passed: false,
            });
          }
        }

        // ----- Spawn coins (sparser than obstacles) -----
        st.coinTimer -= dt;
        if (st.coinTimer <= 0) {
          st.coinTimer = rng(1.6, 3.2);
          st.coins.push({
            x: rng(roadL + 24, roadR - 24),
            y: -30,
            phase: Math.random() * Math.PI * 2,
          });
        }

        // ----- Move world (player-relative) -----
        // Coins, skids, etc. ride on the player's reference frame.
        const playerScroll = st.speed * dt;
        for (const c of st.coins) {
          c.y += playerScroll;
          c.phase += dt * 6;
        }
        for (const s of st.skids) {
          s.y += playerScroll;
          s.life -= dt;
        }
        st.skids = st.skids.filter((s) => s.life > 0 && s.y < H + 20);

        // ----- Coin pickup -----
        for (let i = st.coins.length - 1; i >= 0; i--) {
          const c = st.coins[i];
          if (Math.abs(c.x - st.carX) < 20 && Math.abs(c.y - st.carY) < 30) {
            st.coins.splice(i, 1);
            st.scoreFloat += COIN_VALUE;
            st.floaters.push({
              x: c.x,
              y: c.y,
              life: 0.9,
              text: `+${COIN_VALUE}`,
              hue: 50,
            });
            explode(st, c.x, c.y, "#facc15", 8, 0.7);
            Sfx.pickup();
          }
        }

        // ----- Move obstacles + collision + near-miss -----
        // Each obstacle has its own forward speed; we apply it as a
        // *relative* scroll, so slower vehicles drift down toward the
        // player and faster ones move up the screen and overtake.
        // Before moving, we check for a "leader" in the same lane —
        // if one is within FOLLOW_BUFFER, we cap our forward speed
        // to the leader's so a fast sports car doesn't drive *through*
        // the bus in front of it.
        let crashed = false;
        for (const o of st.obstacles) {
          let effectiveFwd = o.forwardSpeed;
          for (const other of st.obstacles) {
            if (other === o) continue;
            const ldx = Math.abs(o.x - other.x);
            if (ldx > (o.w + other.w) / 2 - 2) continue; // not same lane
            // "Ahead" in screen terms = smaller y (closer to top of
            // road). In world terms it's also "ahead" because both
            // vehicles travel the same direction.
            if (other.y >= o.y) continue;
            const gap = o.y - other.y - (o.h + other.h) / 2;
            if (gap < FOLLOW_BUFFER) {
              effectiveFwd = Math.min(effectiveFwd, other.forwardSpeed);
            }
          }
          const prevY = o.y;
          const relScroll = (st.speed - effectiveFwd) * dt;
          o.y += relScroll;
          o.x += o.vx * dt;
          // Bounce wobblers off the live lane walls
          if (o.x < roadL + o.w / 2) {
            o.x = roadL + o.w / 2;
            o.vx = Math.abs(o.vx);
          }
          if (o.x > roadR - o.w / 2) {
            o.x = roadR - o.w / 2;
            o.vx = -Math.abs(o.vx);
          }
          const dx = Math.abs(o.x - st.carX);
          const dy = Math.abs(o.y - st.carY);
          if (dx < o.w / 2 + carHalf - 4 && dy < o.h / 2 + CAR_H / 2 - 4) {
            crashed = true;
            continue;
          }
          // Near-miss: detect a y-axis crossing in either direction so
          // overtakers passing under the player count too.
          if (!o.passed) {
            const crossing =
              (prevY < st.carY && o.y >= st.carY) ||
              (prevY > st.carY && o.y <= st.carY);
            if (crossing) {
              o.passed = true;
              const lateral = dx - (o.w / 2 + carHalf);
              if (lateral > 0 && lateral < NEAR_MISS_LATERAL_PX) {
                st.combo += 1;
                st.comboTimer = COMBO_DECAY_SECONDS;
                st.nearMisses += 1;
                const reward =
                  NEAR_MISS_BASE + NEAR_MISS_PER_COMBO * (st.combo - 1);
                st.scoreFloat += reward;
                st.floaters.push({
                  x: st.carX,
                  y: st.carY - 30,
                  life: 0.85,
                  text: `+${reward}  ×${st.combo}`,
                  hue: 280,
                });
                st.flashTimer = Math.max(st.flashTimer, 0.18);
                Sfx.bounce();
              }
            }
          }
        }
        // Off-screen on either end (overtakers exit the top, slowpokes
        // exit the bottom)
        st.obstacles = st.obstacles.filter(
          (o) => o.y < H + 200 && o.y > -250,
        );
        st.coins = st.coins.filter((c) => c.y < H + 30);

        // ----- Combo decay -----
        if (st.comboTimer > 0) {
          st.comboTimer = Math.max(0, st.comboTimer - dt);
          if (st.comboTimer === 0) st.combo = 0;
        }

        // ----- Distance score (the bug fix — accumulate as float, only
        //       push to React when the integer changes). -----
        st.scoreFloat += st.speed * dt * SCORE_PER_PX * 16;
        const intScore = Math.floor(st.scoreFloat);
        if (intScore !== scoreRef.current) {
          scoreRef.current = intScore;
          setScore(intScore);
          // Score milestone — every 1000 points triggers a chime + brief
          // bonus banner.
          if (intScore - st.lastMilestone >= MILESTONE_STEP) {
            st.lastMilestone =
              Math.floor(intScore / MILESTONE_STEP) * MILESTONE_STEP;
            st.floaters.push({
              x: W / 2,
              y: 240,
              life: 1.5,
              text: `${st.lastMilestone}!`,
              hue: 50,
            });
            Sfx.win();
          }
        }
        if (st.combo !== comboRef.current) {
          comboRef.current = st.combo;
          setCombo(st.combo);
        }
        const speedRound = Math.round(st.speed);
        if (speedRound !== speedRef.current) {
          speedRef.current = speedRound;
          setSpeed(speedRound);
        }

        // ----- Particles -----
        for (let i = st.particles.length - 1; i >= 0; i--) {
          const p = st.particles[i];
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 0.94;
          p.vy *= 0.94;
          p.life -= dt;
          if (p.life <= 0) st.particles.splice(i, 1);
        }
        st.floaters = st.floaters.filter((f) => (f.life -= dt) > 0);
        // (flashTimer / shake decay moved out of the live block — see
        // top of tick — so the crash doesn't get stuck shaking.)

        // ----- Smoke trail when accelerating -----
        if (st.speed > SPEED_BASE + 50 && Math.random() < 0.6) {
          st.particles.push({
            x: st.carX + rng(-12, 12),
            y: st.carY + 38,
            vx: rng(-15, 15),
            vy: 30 + Math.random() * 40,
            life: 0.6,
            max: 0.6,
            color: "rgba(180,180,200,0.55)",
            r: 3 + Math.random() * 2,
          });
        }

        // ----- Rain drops (slick event) -----
        if (st.event === "slick") {
          const want = 80;
          while (st.rain.length < want) {
            st.rain.push({
              x: rng(0, W),
              y: rng(-H, 0),
              vy: rng(700, 950),
            });
          }
          for (const r of st.rain) {
            r.y += r.vy * dt;
            r.x -= 60 * dt;
            if (r.y > H) {
              r.y = -10;
              r.x = rng(0, W);
            }
          }
        } else if (st.rain.length) {
          // Drain quickly when the event ends
          for (const r of st.rain) r.y += r.vy * dt;
          st.rain = st.rain.filter((r) => r.y < H + 20);
        }

        // ----- Event scheduler -----
        if (
          st.event === "normal" &&
          !st.warningEvent &&
          st.elapsed >= st.nextEventAt
        ) {
          const choices: Exclude<EventKind, "normal">[] = [
            "rush",
            "tunnel",
            "slick",
          ];
          st.warningEvent =
            choices[Math.floor(Math.random() * choices.length)];
          st.warningTimer = EVENT_WARNING_SECONDS;
          Sfx.error();
        }
        if (st.warningTimer > 0) {
          st.warningTimer -= dt;
          if (st.warningTimer <= 0 && st.warningEvent) {
            triggerEvent(st, st.warningEvent);
            st.warningEvent = null;
          }
        }
        if (st.event !== "normal" && st.elapsed >= st.eventEndsAt) {
          st.event = "normal";
          st.nextEventAt =
            st.elapsed + EVENT_GAP_MIN + Math.random() * EVENT_GAP_RANGE;
        }
        if (st.bannerTimer > 0) st.bannerTimer = Math.max(0, st.bannerTimer - dt);

        // ----- Engine sound -----
        // Map speed → engine note within a 5-gear gearbox. Each gear
        // spans GEAR_FREQ_SPAN Hz; a shift drops the pitch back to
        // (gearBase + 0) but at a slightly higher base, so the
        // overall climb still reads as "going faster" with audible
        // gear-change punctuation.
        if (engineRef.current) {
          const speedRatio = Math.max(
            0,
            Math.min(
              1,
              (st.speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN),
            ),
          );
          const gearFloat = speedRatio * GEAR_COUNT;
          const gear = Math.min(GEAR_COUNT - 1, Math.floor(gearFloat));
          const gearProgress = gearFloat - gear;
          const baseFreq = 70 + gear * GEAR_BASE_LIFT;
          const freq = baseFreq + gearProgress * GEAR_FREQ_SPAN;
          const vol = 0.025 + speedRatio * 0.045;
          engineRef.current.update(freq, vol);
          // Detect upshifts and play a brief mechanical thud
          if (gear !== gearRef.current) {
            const prev = gearRef.current;
            gearRef.current = gear;
            if (gear > prev) Sfx.thud();
          }
        }

        // ----- Crash -----
        if (crashed && !overRef.current) {
          setOver(true);
          Sfx.gameOver();
          st.shake = 1;
          // Big particle burst
          explode(st, st.carX, st.carY, "#ef4444", 30, 1.4);
          explode(st, st.carX, st.carY, "#facc15", 18, 1);
          setCrashStats({
            topSpeed: Math.round(st.topSpeed),
            nearMisses: st.nearMisses,
            elapsed: st.elapsed,
          });
          const final = Math.floor(st.scoreFloat);
          setScore(final);
          setBest((b) => {
            const nb = Math.max(b, final);
            if (nb !== b)
              localStorage.setItem("nexplay:drift-best", String(nb));
            return nb;
          });
        }
      }

      // ============================================================
      // ----- DRAW -------------------------------------------------
      // ============================================================
      const shakeX = st.shake > 0 ? (Math.random() - 0.5) * st.shake * 12 : 0;
      const shakeY = st.shake > 0 ? (Math.random() - 0.5) * st.shake * 12 : 0;
      ctx.save();
      ctx.translate(shakeX, shakeY);

      // Background — verge / grass
      const halfBase = (ROAD_RIGHT_BASE - ROAD_LEFT_BASE) / 2;
      const roadL = W / 2 - st.roadHalf;
      const roadR = W / 2 + st.roadHalf;
      ctx.fillStyle = "#0d2b1a";
      ctx.fillRect(0, 0, W, H);

      // Road body
      const roadGrad = ctx.createLinearGradient(roadL, 0, roadR, 0);
      roadGrad.addColorStop(0, "#1b1f2c");
      roadGrad.addColorStop(0.5, "#2a2f3f");
      roadGrad.addColorStop(1, "#1b1f2c");
      ctx.fillStyle = roadGrad;
      ctx.fillRect(roadL, 0, roadR - roadL, H);

      // Road edges (rumble strips, alternating red/white)
      const stripeStep = 32;
      for (let y = -stripeStep + (st.roadOffset % stripeStep); y < H; y += stripeStep) {
        const isRed = Math.floor(y / stripeStep) % 2 === 0;
        ctx.fillStyle = isRed ? "#dc2626" : "white";
        ctx.fillRect(roadL - 6, y, 6, stripeStep / 2);
        ctx.fillRect(roadR, y, 6, stripeStep / 2);
      }

      // Centre lane dashes
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      for (let y = -80 + st.roadOffset; y < H; y += 80) {
        ctx.fillRect(W / 2 - 3, y, 6, 40);
      }

      // Skid marks (under everything else)
      for (const s of st.skids) {
        ctx.fillStyle = `rgba(0,0,0,${(s.life / 0.9) * 0.5})`;
        ctx.fillRect(s.x - 2, s.y, 4, 8);
      }

      // Coins
      for (const c of st.coins) {
        const wob = 1 + 0.15 * Math.sin(c.phase);
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.scale(wob, 1);
        // Glow
        const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 22);
        g.addColorStop(0, "rgba(252,211,77,0.85)");
        g.addColorStop(1, "rgba(252,211,77,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#facc15";
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fde68a";
        ctx.fillRect(-2, -7, 4, 14);
        ctx.restore();
      }

      // Traffic — dispatched by vehicle kind so trucks, buses, sports
      // cars, and motorbikes all read distinctly on the road.
      for (const o of st.obstacles) {
        drawVehicle(ctx, o.kind, o.x, o.y, o.w, o.h, o.hue, false);
      }

      // Player — always a sedan silhouette so the player reads instantly
      drawVehicle(ctx, "sedan", st.carX, st.carY, CAR_W, CAR_H, 270, true);

      // Particles
      for (const p of st.particles) {
        const a = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color.startsWith("rgba")
          ? p.color
          : `${p.color}${Math.floor(a * 255)
              .toString(16)
              .padStart(2, "0")}`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (0.6 + a * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }

      // Rain (slick event)
      if (st.rain.length > 0) {
        ctx.strokeStyle = "rgba(180,220,255,0.45)";
        ctx.lineWidth = 1.4;
        for (const r of st.rain) {
          ctx.beginPath();
          ctx.moveTo(r.x, r.y);
          ctx.lineTo(r.x - 6, r.y + 16);
          ctx.stroke();
        }
      }

      // Tunnel: glowing red walls inside the road, suggesting closed
      // lanes — bonus visual for the narrowed event.
      if (st.event === "tunnel" || (st.roadHalf < halfBase - 4)) {
        const inset = halfBase - st.roadHalf;
        ctx.fillStyle = "rgba(239,68,68,0.18)";
        ctx.fillRect(roadL - inset, 0, inset, H);
        ctx.fillRect(roadR, 0, inset, H);
        ctx.strokeStyle = "rgba(239,68,68,0.85)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(roadL, 0);
        ctx.lineTo(roadL, H);
        ctx.moveTo(roadR, 0);
        ctx.lineTo(roadR, H);
        ctx.stroke();
      }

      // Floating score / combo callouts
      ctx.font = "bold 16px system-ui";
      ctx.textAlign = "center";
      for (const f of st.floaters) {
        const a = Math.min(1, f.life / 0.5);
        ctx.fillStyle = `hsla(${f.hue}, 90%, 70%, ${a})`;
        ctx.fillText(f.text, f.x, f.y - (1 - f.life) * 30);
      }

      // Near-miss / pickup vignette
      if (st.flashTimer > 0) {
        ctx.fillStyle = `rgba(124,92,255,${st.flashTimer * 0.35})`;
        ctx.fillRect(0, 0, W, H);
      }

      // Speed trails when at top speed (motion blur on lane markings)
      if (st.speed > SPEED_MAX * 0.85) {
        ctx.fillStyle = "rgba(255,92,174,0.05)";
        ctx.fillRect(roadL, 0, roadR - roadL, H);
      }

      // Event banner / warning at the top of the road
      if (st.warningEvent) {
        const info = EVENT_INFO[st.warningEvent];
        const a = 0.5 + 0.5 * Math.sin(now * 0.02);
        drawBanner(
          ctx,
          `${info.emoji}  ${info.label}  INCOMING`,
          info.color,
          a,
        );
      } else if (st.event !== "normal" && st.bannerTimer > 0) {
        const info = EVENT_INFO[st.event];
        drawBanner(ctx, `${info.emoji}  ${info.label}`, info.color, 1);
      }

      ctx.restore();

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // We deliberately depend only on `keys`; everything else is read
    // through refs each frame so the loop never restarts mid-game.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Speed-bar colour: green at base, amber mid, red near max
  const speedRatio = Math.min(1, (speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN));
  const speedColour =
    speedRatio > 0.75 ? "#ef4444" : speedRatio > 0.5 ? "#facc15" : "#16a34a";

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#1a0808] to-[#0b0d12] p-2 sm:p-3">
      <div className="shrink-0 flex items-center justify-center gap-2 mb-2 text-white text-xs flex-wrap">
        <Stat label="Score" value={score} accent />
        {combo > 0 ? (
          <span className="px-3 py-1 rounded-lg bg-pink-500/25 border border-pink-400/60 inline-flex items-center gap-1.5 animate-pulse">
            <span className="text-[10px] uppercase tracking-wider opacity-80">
              Combo
            </span>
            <b>×{combo}</b>
          </span>
        ) : (
          <Stat label="Combo" value="—" />
        )}
        <span className="px-3 py-1 rounded-lg bg-white/10 inline-flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider opacity-60">
            Speed
          </span>
          <span className="relative w-20 h-2 rounded-full bg-white/10 overflow-hidden">
            <span
              className="absolute inset-y-0 left-0 transition-all duration-100"
              style={{
                width: `${speedRatio * 100}%`,
                background: speedColour,
              }}
            />
          </span>
          <b className="tabular-nums w-10 text-right">{speed}</b>
        </span>
        <Stat label="Best" value={best} />
        <SoundToggle />
        {started && !over && (
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
            className="absolute inset-0 w-full h-full block rounded-xl border border-white/10"
          />
          {/* On-screen controls for touch devices — left D-pad for
              steering, right cluster for accelerate / brake. Hidden
              on desktop via TouchPad's coarse-pointer media query. */}
          <TouchPad
            visible={started && !over && !paused}
            left={[
              { key: "ArrowLeft", label: "◀" },
              { key: "ArrowRight", label: "▶" },
            ]}
            right={[
              { key: "ArrowDown", label: "▼", tone: "danger" },
              { key: "ArrowUp", label: "▲", tone: "success" },
            ]}
          />
          {!started && !over && (
            <GameOverlay
              icon="🏎️"
              title="Drift King"
              subtitle={
                <>
                  Dodge traffic at speed. Hold{" "}
                  <kbd className="px-1 py-0.5 rounded bg-white/15 border border-white/25 text-white font-mono">
                    ↑
                  </kbd>{" "}
                  to floor it,{" "}
                  <kbd className="px-1 py-0.5 rounded bg-white/15 border border-white/25 text-white font-mono">
                    ←
                  </kbd>
                  /
                  <kbd className="px-1 py-0.5 rounded bg-white/15 border border-white/25 text-white font-mono">
                    →
                  </kbd>{" "}
                  to swerve. Coins, near-misses, and combo chains all
                  bank score; watch out for rush hour, tunnels, and
                  slick weather.
                </>
              }
              primary={{ label: "▶ Race", onClick: start }}
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
              icon="💥"
              title="Crashed"
              subtitle={
                crashStats
                  ? `Score ${score} · top ${crashStats.topSpeed} mph · ${crashStats.nearMisses} near-miss${crashStats.nearMisses === 1 ? "" : "es"} · ${Math.round(crashStats.elapsed)}s on the road`
                  : `Score ${score}`
              }
              primary={{ label: "Race again", onClick: start }}
            >
              <ScoreStatus gameSlug="drift-king" status={submitStatus} />
            </GameOverlay>
          )}
        </div>
      </div>
      <div className="shrink-0 mt-2 text-[11px] hidden sm:block text-white/60 text-center">
        <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono">↑</kbd>{" "}
        accelerate ·{" "}
        <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono">↓</kbd>{" "}
        brake ·{" "}
        <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono">←</kbd>/
        <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono">→</kbd>{" "}
        steer ·{" "}
        <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono">P</kbd>{" "}
        pauses
      </div>
    </div>
  );
}

function drawVehicle(
  ctx: CanvasRenderingContext2D,
  kind: VehicleKind,
  x: number,
  y: number,
  w: number,
  h: number,
  hue: number,
  isPlayer: boolean,
) {
  switch (kind) {
    case "truck":
      drawTruck(ctx, x, y, w, h, hue);
      return;
    case "bus":
      drawBus(ctx, x, y, w, h, hue);
      return;
    case "sports":
      drawSportsCar(ctx, x, y, w, h, hue);
      return;
    case "motorbike":
      drawMotorbike(ctx, x, y, w, h, hue);
      return;
    case "sedan":
    default:
      drawSedan(ctx, x, y, w, h, hue, isPlayer);
      return;
  }
}

function drawSedan(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  hue: number,
  isPlayer: boolean,
) {
  ctx.save();
  ctx.translate(x, y);
  // Body — rounded rectangle with vertical gradient for sheen
  const grad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  grad.addColorStop(0, `hsl(${hue}, 80%, 65%)`);
  grad.addColorStop(0.5, `hsl(${hue}, 80%, 45%)`);
  grad.addColorStop(1, `hsl(${hue}, 80%, 35%)`);
  ctx.fillStyle = grad;
  roundRect(ctx, -w / 2, -h / 2, w, h, 8);
  ctx.fill();
  // Cabin
  ctx.fillStyle = `hsl(${hue}, 60%, 22%)`;
  roundRect(ctx, -w / 2 + 5, -h / 2 + 16, w - 10, h - 32, 4);
  ctx.fill();
  // Windshield + rear glass
  ctx.fillStyle = "rgba(120,200,255,0.55)";
  ctx.fillRect(-w / 2 + 7, -h / 2 + 18, w - 14, 8);
  ctx.fillStyle = "rgba(120,200,255,0.35)";
  ctx.fillRect(-w / 2 + 7, h / 2 - 22, w - 14, 6);
  // Headlights / taillights
  ctx.fillStyle = "#fde68a";
  ctx.fillRect(-w / 2 + 4, -h / 2 + 1, 7, 4);
  ctx.fillRect(w / 2 - 11, -h / 2 + 1, 7, 4);
  ctx.fillStyle = isPlayer ? "#ef4444" : "#dc2626";
  ctx.fillRect(-w / 2 + 4, h / 2 - 5, 7, 4);
  ctx.fillRect(w / 2 - 11, h / 2 - 5, 7, 4);
  // Wheels
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(-w / 2 - 4, -h / 2 + 8, 5, 14);
  ctx.fillRect(w / 2 - 1, -h / 2 + 8, 5, 14);
  ctx.fillRect(-w / 2 - 4, h / 2 - 22, 5, 14);
  ctx.fillRect(w / 2 - 1, h / 2 - 22, 5, 14);
  if (isPlayer) {
    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.lineWidth = 1.5;
    roundRect(ctx, -w / 2, -h / 2, w, h, 8);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTruck(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  hue: number,
) {
  ctx.save();
  ctx.translate(x, y);
  // Cab (front ~30% of length)
  const cabH = Math.round(h * 0.32);
  const cabTop = -h / 2;
  const cabGrad = ctx.createLinearGradient(0, cabTop, 0, cabTop + cabH);
  cabGrad.addColorStop(0, `hsl(${hue}, 75%, 60%)`);
  cabGrad.addColorStop(1, `hsl(${hue}, 75%, 35%)`);
  ctx.fillStyle = cabGrad;
  roundRect(ctx, -w / 2 + 2, cabTop, w - 4, cabH, 6);
  ctx.fill();
  // Cab windshield
  ctx.fillStyle = "rgba(120,200,255,0.55)";
  ctx.fillRect(-w / 2 + 7, cabTop + 6, w - 14, 12);
  // Headlights
  ctx.fillStyle = "#fde68a";
  ctx.fillRect(-w / 2 + 4, cabTop + 1, 8, 4);
  ctx.fillRect(w / 2 - 12, cabTop + 1, 8, 4);
  // Trailer (cargo box) — separate slab with horizontal panel lines
  const trailerTop = cabTop + cabH + 2;
  const trailerH = h - cabH - 4;
  ctx.fillStyle = "#7a6b56";
  ctx.fillRect(-w / 2, trailerTop, w, trailerH);
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 1;
  for (let yy = trailerTop + 14; yy < trailerTop + trailerH; yy += 18) {
    ctx.beginPath();
    ctx.moveTo(-w / 2, yy);
    ctx.lineTo(w / 2, yy);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = 2;
  ctx.strokeRect(-w / 2, trailerTop, w, trailerH);
  // Taillights
  ctx.fillStyle = "#dc2626";
  ctx.fillRect(-w / 2 + 4, h / 2 - 5, 8, 4);
  ctx.fillRect(w / 2 - 12, h / 2 - 5, 8, 4);
  // Wheels — pair at the cab + 2 pairs along the trailer
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(-w / 2 - 4, cabTop + 12, 5, 14);
  ctx.fillRect(w / 2 - 1, cabTop + 12, 5, 14);
  for (let i = 0; i < 2; i++) {
    const yy = trailerTop + 12 + i * (trailerH / 2);
    ctx.fillRect(-w / 2 - 4, yy, 5, 14);
    ctx.fillRect(w / 2 - 1, yy, 5, 14);
  }
  ctx.restore();
}

function drawBus(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  hue: number,
) {
  ctx.save();
  ctx.translate(x, y);
  const grad = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  grad.addColorStop(0, `hsl(${hue}, 80%, 50%)`);
  grad.addColorStop(0.5, `hsl(${hue}, 80%, 60%)`);
  grad.addColorStop(1, `hsl(${hue}, 80%, 50%)`);
  ctx.fillStyle = grad;
  roundRect(ctx, -w / 2, -h / 2, w, h, 6);
  ctx.fill();
  // Top windshield
  ctx.fillStyle = "rgba(120,200,255,0.55)";
  ctx.fillRect(-w / 2 + 8, -h / 2 + 8, w - 16, 12);
  // Side window strip running the length
  ctx.fillStyle = "rgba(120,200,255,0.35)";
  ctx.fillRect(-w / 2 + 6, -h / 2 + 26, w - 12, h - 56);
  // Window dividers — every ~22 px
  ctx.strokeStyle = `hsl(${hue}, 60%, 25%)`;
  ctx.lineWidth = 2;
  for (let yy = -h / 2 + 48; yy < h / 2 - 30; yy += 22) {
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 6, yy);
    ctx.lineTo(w / 2 - 6, yy);
    ctx.stroke();
  }
  // Rear emergency door
  ctx.fillStyle = `hsl(${hue}, 60%, 25%)`;
  ctx.fillRect(-w / 4, h / 2 - 22, w / 2, 14);
  // Headlights / taillights
  ctx.fillStyle = "#fde68a";
  ctx.fillRect(-w / 2 + 4, -h / 2 + 1, 8, 4);
  ctx.fillRect(w / 2 - 12, -h / 2 + 1, 8, 4);
  ctx.fillStyle = "#dc2626";
  ctx.fillRect(-w / 2 + 4, h / 2 - 5, 8, 4);
  ctx.fillRect(w / 2 - 12, h / 2 - 5, 8, 4);
  // Wheels — front pair, rear pair (buses ride high)
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(-w / 2 - 4, -h / 2 + 18, 5, 16);
  ctx.fillRect(w / 2 - 1, -h / 2 + 18, 5, 16);
  ctx.fillRect(-w / 2 - 4, h / 2 - 34, 5, 16);
  ctx.fillRect(w / 2 - 1, h / 2 - 34, 5, 16);
  ctx.restore();
}

function drawSportsCar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  hue: number,
) {
  ctx.save();
  ctx.translate(x, y);
  // Sleeker body — same shape as a sedan but with a racing stripe
  const grad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  grad.addColorStop(0, `hsl(${hue}, 90%, 60%)`);
  grad.addColorStop(1, `hsl(${hue}, 85%, 30%)`);
  ctx.fillStyle = grad;
  roundRect(ctx, -w / 2, -h / 2, w, h, 10);
  ctx.fill();
  // Lower cabin (sportier, smaller window area)
  ctx.fillStyle = `hsl(${hue}, 70%, 18%)`;
  roundRect(ctx, -w / 2 + 6, -h / 2 + 20, w - 12, h - 40, 4);
  ctx.fill();
  // Windshield
  ctx.fillStyle = "rgba(120,200,255,0.6)";
  ctx.fillRect(-w / 2 + 8, -h / 2 + 22, w - 16, 8);
  // Twin racing stripes down the centre
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(-5, -h / 2 + 4, 2, h - 8);
  ctx.fillRect(3, -h / 2 + 4, 2, h - 8);
  // Rear spoiler
  ctx.fillStyle = `hsl(${hue}, 70%, 20%)`;
  ctx.fillRect(-w / 2 + 3, h / 2 - 8, w - 6, 4);
  ctx.fillStyle = `hsl(${hue}, 70%, 30%)`;
  ctx.fillRect(-w / 2 + 5, h / 2 - 4, w - 10, 3);
  // Pointed headlights
  ctx.fillStyle = "#fde68a";
  ctx.beginPath();
  ctx.moveTo(-w / 2 + 4, -h / 2 + 1);
  ctx.lineTo(-w / 2 + 12, -h / 2 + 1);
  ctx.lineTo(-w / 2 + 10, -h / 2 + 5);
  ctx.lineTo(-w / 2 + 4, -h / 2 + 5);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w / 2 - 4, -h / 2 + 1);
  ctx.lineTo(w / 2 - 12, -h / 2 + 1);
  ctx.lineTo(w / 2 - 10, -h / 2 + 5);
  ctx.lineTo(w / 2 - 4, -h / 2 + 5);
  ctx.closePath();
  ctx.fill();
  // Taillights
  ctx.fillStyle = "#ef4444";
  ctx.fillRect(-w / 2 + 4, h / 2 - 12, w - 8, 3);
  // Wheels (low-profile)
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(-w / 2 - 3, -h / 2 + 10, 4, 12);
  ctx.fillRect(w / 2 - 1, -h / 2 + 10, 4, 12);
  ctx.fillRect(-w / 2 - 3, h / 2 - 22, 4, 12);
  ctx.fillRect(w / 2 - 1, h / 2 - 22, 4, 12);
  ctx.restore();
}

function drawMotorbike(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  hue: number,
) {
  ctx.save();
  ctx.translate(x, y);
  // Front wheel (top)
  ctx.fillStyle = "#0a0a0a";
  ctx.beginPath();
  ctx.arc(0, -h / 2 + 8, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a3a3a";
  ctx.beginPath();
  ctx.arc(0, -h / 2 + 8, 3, 0, Math.PI * 2);
  ctx.fill();
  // Rear wheel (bottom)
  ctx.fillStyle = "#0a0a0a";
  ctx.beginPath();
  ctx.arc(0, h / 2 - 8, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a3a3a";
  ctx.beginPath();
  ctx.arc(0, h / 2 - 8, 3, 0, Math.PI * 2);
  ctx.fill();
  // Body (between wheels)
  ctx.fillStyle = `hsl(${hue}, 80%, 50%)`;
  roundRect(ctx, -w / 2 + 2, -h / 2 + 14, w - 4, h - 28, 5);
  ctx.fill();
  // Rider silhouette (helmet + body)
  ctx.fillStyle = "#1c1f2c";
  ctx.beginPath();
  ctx.arc(0, -2, 5, 0, Math.PI * 2);
  ctx.fill(); // helmet
  ctx.fillRect(-5, 1, 10, 12); // torso
  // Headlight
  ctx.fillStyle = "#fde68a";
  ctx.fillRect(-3, -h / 2 + 1, 6, 3);
  // Taillight
  ctx.fillStyle = "#ef4444";
  ctx.fillRect(-3, h / 2 - 4, 6, 3);
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

function drawBanner(
  ctx: CanvasRenderingContext2D,
  text: string,
  colour: string,
  alpha: number,
) {
  ctx.save();
  const w = 320;
  const h = 44;
  const x = (W - w) / 2;
  const y = 60;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 10);
  ctx.stroke();
  ctx.fillStyle = colour;
  ctx.font = "bold 16px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, W / 2, y + h / 2);
  ctx.restore();
}

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
          ? "bg-[var(--accent)]/20 border border-[var(--accent)]/40"
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
