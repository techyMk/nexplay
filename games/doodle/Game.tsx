"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";
import { GameOverlay, PauseToggle } from "@/components/games/GameOverlay";
import { SoundToggle } from "@/components/SoundToggle";
import { TouchPad } from "@/components/games/TouchPad";
import { Sfx } from "@/lib/sound";

// Canvas dimensions
const VIEW_W = 480;
const VIEW_H = 720;

// Player
const PLAYER_W = 36;
const PLAYER_H = 44;
const PLAYER_FEET_HALF = 14;

// Physics
const GRAVITY = 1100;
const JUMP_VEL = -560;
const SPRING_VEL = -820;
const ROCKET_VEL = -440;
const ROCKET_DURATION = 3.5;
const MOVE_SPEED = 340;
/** Lateral acceleration time-constant — bigger = snappier steering. */
const STEER_K = 9;

// Platforms
const PLATFORM_H = 14;
const VERTICAL_GAP_MIN = 70;
const VERTICAL_GAP_MAX = 108;

// Difficulty cap (in metres) — past this point, parameters plateau
// so the game stays consistently hard rather than impossible.
const DIFFICULTY_CAP = 6000;

type PlatformKind = "static" | "moving" | "breakable" | "spring";

type Platform = {
  id: number;
  x: number;
  y: number; // world y (smaller = higher up, canvas coords)
  w: number;
  h: number;
  kind: PlatformKind;
  vx: number;
  alive: boolean;
  /** Time remaining before a broken platform's debris is removed. */
  breakTimer: number;
  /** Optional rocket power-up sitting on top of this platform. */
  powerup: "rocket" | null;
};

type Enemy = {
  id: number;
  x: number;
  y: number;
  vx: number;
  alive: boolean;
  bobPhase: number;
  flapPhase: number;
  squashedFor: number;
};

type Coin = {
  id: number;
  x: number;
  y: number;
  collected: boolean;
  phase: number;
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
  /** When true, the particle stays "in world" — it scrolls with
   *  the camera. Otherwise it's screen-locked (rocket trail behind
   *  the player). */
  worldSpace: boolean;
};

type Floater = {
  x: number;
  y: number;
  life: number;
  text: string;
  hue: number;
  worldSpace: boolean;
};

type Cloud = { x: number; y: number; w: number; parallax: number };
type Star = { x: number; y: number; tw: number };

type State = {
  px: number;
  py: number;
  pvx: number;
  pvy: number;
  cameraY: number;
  facing: 1 | -1;
  alive: boolean;
  rocketTime: number;
  height: number; // best metres reached this run
  platforms: Platform[];
  enemies: Enemy[];
  coins: Coin[];
  particles: Particle[];
  floaters: Floater[];
  clouds: Cloud[];
  stars: Star[];
  nextId: number;
  legPhase: number;
  squashFor: number;
  /** Time since last enemy spawn — gates how often new enemies show up. */
  enemyCool: number;
  /** Brief screen-shake on heavy impact (squash, rocket activation). */
  shake: number;
};

function rng(min: number, max: number) {
  return min + Math.random() * (max - min);
}

let _id = 0;
function nextId() {
  return ++_id;
}

function makeStarter(): State {
  const platforms: Platform[] = [];
  // Seed the visible region with platforms so the player has
  // something to land on immediately.
  let y = 660;
  // First platform sits squarely under the spawn point
  platforms.push(
    makePlatform(y, "static", VIEW_W / 2 - 36, 72),
  );
  y -= rng(VERTICAL_GAP_MIN, VERTICAL_GAP_MAX);
  while (y > -200) {
    const def = pickPlatformKind(0);
    const w = rng(58, 78);
    const x = rng(8, VIEW_W - w - 8);
    platforms.push(makePlatform(y, def, x, w));
    y -= rng(VERTICAL_GAP_MIN, VERTICAL_GAP_MAX);
  }
  return {
    px: VIEW_W / 2,
    py: 600,
    pvx: 0,
    pvy: JUMP_VEL,
    cameraY: 0,
    facing: 1,
    alive: true,
    rocketTime: 0,
    height: 0,
    platforms,
    enemies: [],
    coins: [],
    particles: [],
    floaters: [],
    clouds: makeClouds(),
    stars: makeStars(),
    nextId: 0,
    legPhase: 0,
    squashFor: 0,
    enemyCool: 4,
    shake: 0,
  };
}

function makePlatform(
  y: number,
  kind: PlatformKind,
  x: number,
  w: number,
): Platform {
  const direction = Math.random() < 0.5 ? -1 : 1;
  return {
    id: nextId(),
    x,
    y,
    w,
    h: PLATFORM_H,
    kind,
    vx: kind === "moving" ? direction * 70 : 0,
    alive: true,
    breakTimer: 0,
    powerup: null,
  };
}

function pickPlatformKind(altitudeM: number): PlatformKind {
  const t = Math.min(1, altitudeM / DIFFICULTY_CAP);
  const moving = 0.05 + t * 0.30;
  const breakable = 0.05 + t * 0.20;
  const spring = 0.06;
  const r = Math.random();
  if (r < spring) return "spring";
  if (r < spring + moving) return "moving";
  if (r < spring + moving + breakable) return "breakable";
  return "static";
}

function makeClouds(): Cloud[] {
  return Array.from({ length: 6 }, () => ({
    x: rng(0, VIEW_W),
    // Spread across two screen-heights of world space; the
    // parallax draw wraps mod (VIEW_H * 2) so clouds recycle
    // forever as the player climbs.
    y: rng(0, VIEW_H * 2),
    w: rng(60, 110),
    parallax: 0.3 + Math.random() * 0.2,
  }));
}

function makeStars(): Star[] {
  return Array.from({ length: 60 }, () => ({
    x: rng(0, VIEW_W),
    y: rng(0, VIEW_H),
    tw: Math.random() * Math.PI * 2,
  }));
}

export default function Doodle() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [coins, setCoins] = useState(0);
  const [over, setOver] = useState(false);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [rocketLeft, setRocketLeft] = useState(0);
  const submitStatus = useSubmitScoreOnGameOver("doodle-jump", score, over);

  const startedRef = useRef(false);
  startedRef.current = started;
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const overRef = useRef(false);
  overRef.current = over;
  const scoreRef = useRef(0);
  scoreRef.current = score;

  const stateRef = useRef<State>(makeStarter());
  const inputRef = useRef({ left: false, right: false });
  const rocketLeftRef = useRef(0);

  useEffect(() => {
    setBest(Number(localStorage.getItem("nexplay:doodle-best") || 0));
  }, []);

  const reset = useCallback(() => {
    stateRef.current = makeStarter();
    inputRef.current = { left: false, right: false };
    setScore(0);
    setCoins(0);
    setRocketLeft(0);
    setOver(false);
    setStarted(false);
    setPaused(false);
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

  // Keyboard input
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        e.preventDefault();
        togglePause();
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        e.preventDefault();
        inputRef.current.left = true;
      }
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        e.preventDefault();
        inputRef.current.right = true;
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        inputRef.current.left = false;
      }
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        inputRef.current.right = false;
      }
    };
    const onBlur = () => {
      inputRef.current = { left: false, right: false };
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [togglePause]);

  // Touch / pointer — left half = move left, right half = move right
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const apply = (clientX: number) => {
      const rect = wrap.getBoundingClientRect();
      const xf = (clientX - rect.left) / rect.width;
      inputRef.current.left = xf < 0.5;
      inputRef.current.right = xf >= 0.5;
    };
    const release = () => {
      inputRef.current.left = false;
      inputRef.current.right = false;
    };
    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      apply(e.clientX);
    };
    const onMove = (e: PointerEvent) => {
      // Only track movement while the button/finger is down
      if (e.buttons === 0 && e.pressure === 0) return;
      apply(e.clientX);
    };
    wrap.addEventListener("pointerdown", onDown);
    wrap.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      wrap.removeEventListener("pointerdown", onDown);
      wrap.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, []);

  // Main loop
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();

    const burst = (
      st: State,
      x: number,
      y: number,
      hue: number,
      n: number,
      power = 1,
      worldSpace = true,
    ) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (40 + Math.random() * 140) * power;
        st.particles.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 0.55,
          max: 0.55,
          hue,
          r: 1.5 + Math.random() * 2,
          worldSpace,
        });
      }
    };

    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      const live =
        startedRef.current && !pausedRef.current && !overRef.current;

      if (st.shake > 0) st.shake = Math.max(0, st.shake - dt * 4);

      if (live) {
        // ----- Player input → smooth horizontal velocity -----
        let inputX = 0;
        if (inputRef.current.left) inputX -= 1;
        if (inputRef.current.right) inputX += 1;
        if (inputX !== 0) st.facing = inputX > 0 ? 1 : -1;
        const targetVx = inputX * MOVE_SPEED;
        const accel = 1 - Math.exp(-dt * STEER_K);
        st.pvx += (targetVx - st.pvx) * accel;

        // ----- Vertical motion / rocket -----
        if (st.rocketTime > 0) {
          st.rocketTime = Math.max(0, st.rocketTime - dt);
          // Glide upward at constant rocket speed; ignore gravity
          // until the timer expires
          st.pvy = ROCKET_VEL;
          // Rocket exhaust trail (screen-locked particles fan out
          // below the player)
          if (Math.random() < 0.7) {
            burst(
              st,
              st.px + rng(-6, 6),
              st.py + 14,
              rng(15, 50),
              1,
              0.5,
              false,
            );
          }
        } else {
          st.pvy += GRAVITY * dt;
        }

        // Move
        const prevPy = st.py;
        st.px += st.pvx * dt;
        st.py += st.pvy * dt;

        // Wrap horizontal — classic Doodle Jump trick: walk off
        // the right edge, reappear on the left and vice-versa.
        if (st.px > VIEW_W + PLAYER_W / 2) st.px -= VIEW_W;
        if (st.px < -PLAYER_W / 2) st.px += VIEW_W;

        // ----- Platform collision (only when falling, no rocket) -----
        if (st.pvy > 0 && st.rocketTime <= 0) {
          const prevFeet = prevPy + PLAYER_H / 2;
          const curFeet = st.py + PLAYER_H / 2;
          for (const p of st.platforms) {
            if (!p.alive) continue;
            if (prevFeet > p.y) continue;
            if (curFeet < p.y) continue;
            if (st.px + PLAYER_FEET_HALF < p.x) continue;
            if (st.px - PLAYER_FEET_HALF > p.x + p.w) continue;
            // Land on this platform
            st.py = p.y - PLAYER_H / 2;
            if (p.kind === "spring") {
              st.pvy = SPRING_VEL;
              st.squashFor = 0.18;
              Sfx.boost();
              burst(st, st.px, p.y, 130, 8);
            } else {
              st.pvy = JUMP_VEL;
              st.squashFor = 0.12;
              Sfx.jump();
            }
            if (p.kind === "breakable") {
              p.alive = false;
              p.breakTimer = 0.6;
              burst(st, p.x + p.w / 2, p.y, 0, 10, 0.7);
            }
            // Powerup pickup on landing
            if (p.powerup === "rocket") {
              p.powerup = null;
              st.rocketTime = ROCKET_DURATION;
              st.shake = 0.8;
              Sfx.boost();
              st.floaters.push({
                x: st.px,
                y: st.py - 30,
                life: 1.2,
                text: "🚀 ROCKET!",
                hue: 30,
                worldSpace: true,
              });
            }
            break;
          }
        }

        // ----- Camera follow (only upward) -----
        if (st.py < st.cameraY + 300) {
          st.cameraY = st.py - 300;
        }

        // ----- Track height in metres + add the *delta* to the
        // running score so coin/enemy bonuses stay in the total
        // instead of being overwritten by the climb tick. -----
        const altitudeM = Math.max(0, Math.round(-st.cameraY / 10));
        if (altitudeM > st.height) {
          const delta = altitudeM - st.height;
          st.height = altitudeM;
          scoreRef.current += delta;
          setScore(scoreRef.current);
        }

        // ----- Spawn platforms above the camera until well-stocked -----
        let highestY = Infinity;
        for (const p of st.platforms) {
          if (p.alive && p.y < highestY) highestY = p.y;
        }
        const targetTopY = st.cameraY - 200;
        while (highestY > targetTopY) {
          const gap = rng(VERTICAL_GAP_MIN, VERTICAL_GAP_MAX);
          const newY = highestY - gap;
          const kind = pickPlatformKind(altitudeM);
          const baseW = kind === "static" ? rng(64, 80) : rng(54, 68);
          const x = rng(8, VIEW_W - baseW - 8);
          const plat = makePlatform(newY, kind, x, baseW);
          // Difficulty-scaled moving-platform speed
          if (kind === "moving") {
            const t = Math.min(1, altitudeM / DIFFICULTY_CAP);
            plat.vx =
              (Math.random() < 0.5 ? -1 : 1) * (60 + t * 90);
          }
          // Sparse rocket spawn — appears more often the higher you
          // climb so they show up exactly when the difficulty starts
          // biting.
          const rocketChance = altitudeM > 800 ? 0.025 : 0;
          if (Math.random() < rocketChance && kind !== "breakable") {
            plat.powerup = "rocket";
          }
          st.platforms.push(plat);
          // Maybe drop a coin near this platform
          if (Math.random() < 0.22) {
            st.coins.push({
              id: nextId(),
              x: rng(20, VIEW_W - 20),
              y: newY - rng(20, 50),
              collected: false,
              phase: Math.random() * Math.PI * 2,
            });
          }
          highestY = newY;
        }

        // ----- Move platforms (only "moving" types do anything) -----
        for (const p of st.platforms) {
          if (!p.alive) continue;
          if (p.kind === "moving") {
            p.x += p.vx * dt;
            if (p.x < 4) {
              p.x = 4;
              p.vx = Math.abs(p.vx);
            }
            if (p.x > VIEW_W - p.w - 4) {
              p.x = VIEW_W - p.w - 4;
              p.vx = -Math.abs(p.vx);
            }
          }
        }

        // ----- Spawn enemies above 1500 m, capped frequency -----
        st.enemyCool -= dt;
        if (
          altitudeM > 1500 &&
          st.enemyCool <= 0 &&
          st.enemies.filter((e) => e.alive).length < 3
        ) {
          const t = Math.min(1, altitudeM / DIFFICULTY_CAP);
          // Spawn cooldown shrinks as you climb
          st.enemyCool = 5.5 - t * 3;
          const newY = st.cameraY - 80;
          st.enemies.push({
            id: nextId(),
            x: rng(40, VIEW_W - 40),
            y: newY,
            vx: (Math.random() < 0.5 ? -1 : 1) * (40 + t * 60),
            alive: true,
            bobPhase: Math.random() * Math.PI * 2,
            flapPhase: Math.random() * Math.PI * 2,
            squashedFor: 0,
          });
        }

        // ----- Update enemies -----
        for (const e of st.enemies) {
          if (!e.alive) {
            if (e.squashedFor > 0) e.squashedFor -= dt;
            continue;
          }
          e.x += e.vx * dt;
          e.bobPhase += dt * 2.5;
          e.flapPhase += dt * 9;
          e.y += Math.sin(e.bobPhase) * 12 * dt;
          if (e.x < 24 || e.x > VIEW_W - 24) {
            e.vx = -e.vx;
            e.x = Math.max(24, Math.min(VIEW_W - 24, e.x));
          }
          // Collision with player
          const dx = Math.abs(e.x - st.px);
          const dy = Math.abs(e.y - st.py);
          if (dx < PLAYER_W / 2 + 16 && dy < PLAYER_H / 2 + 14) {
            // If player is falling AND clearly above the enemy, squash.
            // Otherwise the enemy hits the player.
            if (
              st.pvy > 0 &&
              prevPy + PLAYER_H / 2 < e.y - 4 &&
              st.rocketTime <= 0
            ) {
              e.alive = false;
              e.squashedFor = 0.4;
              st.pvy = JUMP_VEL * 0.85;
              st.squashFor = 0.18;
              scoreRef.current += 200;
              setScore(scoreRef.current);
              burst(st, e.x, e.y, 0, 14, 1);
              Sfx.bigPickup();
              st.floaters.push({
                x: e.x,
                y: e.y - 8,
                life: 0.9,
                text: "+200",
                hue: 0,
                worldSpace: true,
              });
            } else if (st.rocketTime > 0) {
              // Rocket plows through enemies
              e.alive = false;
              burst(st, e.x, e.y, 30, 12, 0.8);
              Sfx.hit();
            } else {
              // Player dies
              if (!overRef.current) endRun();
            }
          }
        }

        // ----- Coin pickup -----
        for (const c of st.coins) {
          if (c.collected) continue;
          c.phase += dt * 5;
          const dx = Math.abs(c.x - st.px);
          const dy = Math.abs(c.y - st.py);
          if (dx < PLAYER_W / 2 + 8 && dy < PLAYER_H / 2 + 8) {
            c.collected = true;
            scoreRef.current += 50;
            setScore(scoreRef.current);
            setCoins((cs) => cs + 1);
            burst(st, c.x, c.y, 50, 8, 0.7);
            Sfx.pickup();
          }
        }

        // ----- Cleanup off-camera entities + breaking platforms -----
        const cullBelow = st.cameraY + VIEW_H + 80;
        st.platforms = st.platforms.filter((p) => {
          if (!p.alive) {
            p.breakTimer -= dt;
            if (p.breakTimer <= 0) return false;
          }
          return p.y < cullBelow;
        });
        st.enemies = st.enemies.filter(
          (e) => e.y < cullBelow + 200 && (e.alive || e.squashedFor > 0),
        );
        st.coins = st.coins.filter(
          (c) => c.y < cullBelow && !c.collected,
        );

        // ----- Particles -----
        for (let i = st.particles.length - 1; i >= 0; i--) {
          const p = st.particles[i];
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (!p.worldSpace) p.vy += 200 * dt; // exhaust trails fall
          p.vx *= 0.94;
          p.vy *= 0.94;
          p.life -= dt;
          if (p.life <= 0) st.particles.splice(i, 1);
        }
        st.floaters = st.floaters.filter((f) => (f.life -= dt) > 0);

        // ----- Animation phases -----
        st.legPhase = (st.legPhase + dt * 6) % 1;
        if (st.squashFor > 0) st.squashFor = Math.max(0, st.squashFor - dt);

        // ----- Game over: fall below screen -----
        if (st.py > st.cameraY + VIEW_H + 60 && !overRef.current) {
          endRun();
        }

        // ----- Update HUD-bound state -----
        if (Math.round(st.rocketTime * 10) !== rocketLeftRef.current) {
          rocketLeftRef.current = Math.round(st.rocketTime * 10);
          setRocketLeft(st.rocketTime);
        }
      }

      // ============================================================
      // ----- DRAW -------------------------------------------------
      // ============================================================
      // Sky gradient — interpolates from clear blue at altitude 0 to
      // a deep violet near 5000m, then black starfield above that.
      const altT = Math.min(1, st.height / 5000);
      const top = lerpColor("#3aafff", "#0a0524", altT);
      const bot = lerpColor("#a8e6ff", "#1a0a3d", altT);
      const skyGrad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
      skyGrad.addColorStop(0, top);
      skyGrad.addColorStop(1, bot);
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);

      // Stars — only above 1500m, fading in
      if (st.height > 1500) {
        const starA = Math.min(1, (st.height - 1500) / 2500);
        for (const s of st.stars) {
          const tw = 0.6 + 0.4 * Math.sin(now * 0.004 + s.tw);
          ctx.fillStyle = `rgba(255,255,255,${starA * tw})`;
          ctx.fillRect(s.x, s.y, 1.5, 1.5);
        }
      }

      // Camera shake (only on strong impacts — kept subtle)
      const shakeX = st.shake > 0 ? (Math.random() - 0.5) * st.shake * 5 : 0;
      const shakeY = st.shake > 0 ? (Math.random() - 0.5) * st.shake * 5 : 0;
      ctx.save();
      ctx.translate(shakeX, shakeY);

      // Clouds — parallax layer (move slower than world). Wrap
      // positively so the JS-style negative modulo on `cameraY` near
      // zero doesn't push clouds off-screen.
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      for (const c of st.clouds) {
        const raw = (c.y - st.cameraY * c.parallax) % (VIEW_H * 2);
        const wrapped = (raw + VIEW_H * 2) % (VIEW_H * 2);
        const screenY = wrapped - 100;
        if (screenY > VIEW_H + 60 || screenY < -60) continue;
        drawCloud(ctx, c.x, screenY, c.w);
      }

      // World-space particles (behind platforms)
      for (const p of st.particles) {
        if (!p.worldSpace) continue;
        const a = Math.max(0, p.life / p.max);
        ctx.fillStyle = `hsla(${p.hue},90%,72%,${a})`;
        ctx.beginPath();
        ctx.arc(
          p.x,
          p.y - st.cameraY,
          p.r * (0.5 + a * 0.6),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }

      // Platforms
      for (const p of st.platforms) {
        const screenY = p.y - st.cameraY;
        if (screenY > VIEW_H + 30 || screenY < -30) continue;
        if (!p.alive) {
          // Falling debris animation
          const fall = (1 - p.breakTimer / 0.6) * 80;
          drawPlatform(ctx, p, screenY + fall, p.breakTimer / 0.6);
        } else {
          drawPlatform(ctx, p, screenY, 1);
        }
      }

      // Coins
      for (const c of st.coins) {
        if (c.collected) continue;
        const screenY = c.y - st.cameraY;
        if (screenY > VIEW_H + 20 || screenY < -20) continue;
        drawCoin(ctx, c.x, screenY, c.phase);
      }

      // Enemies
      for (const e of st.enemies) {
        const screenY = e.y - st.cameraY;
        if (screenY > VIEW_H + 40 || screenY < -40) continue;
        drawEnemy(ctx, e.x, screenY, e);
      }

      // Player
      const playerScreenY = st.py - st.cameraY;
      drawPlayer(
        ctx,
        st.px,
        playerScreenY,
        st.facing,
        st.pvy,
        st.squashFor,
        st.rocketTime > 0,
      );
      // Mirror at the wraparound edge — when the player straddles
      // either side, draw a ghost on the opposite side so the wrap
      // reads instantly instead of feeling like a teleport.
      if (st.px < PLAYER_W / 2) {
        drawPlayer(
          ctx,
          st.px + VIEW_W,
          playerScreenY,
          st.facing,
          st.pvy,
          st.squashFor,
          st.rocketTime > 0,
        );
      } else if (st.px > VIEW_W - PLAYER_W / 2) {
        drawPlayer(
          ctx,
          st.px - VIEW_W,
          playerScreenY,
          st.facing,
          st.pvy,
          st.squashFor,
          st.rocketTime > 0,
        );
      }

      // Screen-space particles (rocket exhaust)
      for (const p of st.particles) {
        if (p.worldSpace) continue;
        const a = Math.max(0, p.life / p.max);
        ctx.fillStyle = `hsla(${p.hue},90%,70%,${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y - st.cameraY, p.r * a, 0, Math.PI * 2);
        ctx.fill();
      }

      // Floating score callouts
      ctx.font = "bold 16px system-ui";
      ctx.textAlign = "center";
      for (const f of st.floaters) {
        const a = Math.min(1, f.life / 0.6);
        const y = f.worldSpace ? f.y - st.cameraY : f.y;
        ctx.fillStyle = `hsla(${f.hue},90%,75%,${a})`;
        ctx.fillText(f.text, f.x, y - (1 - f.life) * 24);
      }
      ctx.textAlign = "left";

      // Rocket bar — top-left, only while rocket is active
      if (st.rocketTime > 0) {
        const ratio = st.rocketTime / ROCKET_DURATION;
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(12, 12, 90, 12);
        ctx.fillStyle = "#f97316";
        ctx.fillRect(12, 12, 90 * ratio, 12);
        ctx.fillStyle = "white";
        ctx.font = "bold 11px system-ui";
        ctx.fillText("🚀 ROCKET", 16, 22);
      }

      ctx.restore();

      raf = requestAnimationFrame(tick);
    };

    function endRun() {
      setOver(true);
      Sfx.gameOver();
      // Score already tracks height + bonuses; freeze it for the
      // game-over screen and update the personal best.
      const finalScore = scoreRef.current;
      setBest((b) => {
        const nb = Math.max(b, finalScore);
        if (nb !== b)
          localStorage.setItem("nexplay:doodle-best", String(nb));
        return nb;
      });
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#0a1424] to-[#020611] p-2 sm:p-3">
      <div className="shrink-0 flex items-center justify-center gap-2 mb-2 text-white text-xs sm:text-sm flex-wrap">
        <Stat label="Score" value={score} accent />
        <Stat label="Coins" value={coins} icon="🪙" />
        <Stat label="Best" value={best} />
        {rocketLeft > 0 && (
          <span className="px-3 py-1 rounded-lg bg-orange-500/25 border border-orange-400/60 inline-flex items-center gap-1.5 animate-pulse">
            <span>🚀</span>
            <b>{rocketLeft.toFixed(1)}s</b>
          </span>
        )}
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
            className="absolute inset-0 w-full h-full block rounded-xl border border-white/10 shadow-[0_0_24px_rgba(0,0,0,0.45)]"
          />
          {/* Touch L/R steering — jumping is automatic. Hidden
              under the intro / pause / over overlays. */}
          <TouchPad
            visible={started && !over && !paused}
            left={[{ key: "ArrowLeft", label: "◀" }]}
            right={[{ key: "ArrowRight", label: "▶" }]}
          />
          {!started && !over && (
            <GameOverlay
              icon="🦗"
              title="Doodle"
              subtitle={
                <>
                  Bounce ever upward. Move with{" "}
                  <kbd className="px-1 py-0.5 rounded bg-white/15 border border-white/25 text-white font-mono">
                    ←
                  </kbd>
                  /
                  <kbd className="px-1 py-0.5 rounded bg-white/15 border border-white/25 text-white font-mono">
                    →
                  </kbd>{" "}
                  or tap halves on mobile. Springs send you flying,
                  rockets skip whole stretches, and the higher you
                  climb the meaner the platforms get.
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
              icon="💥"
              title="Down you go"
              subtitle={`Reached ${score}m · ${coins} coins · ${score >= best ? "new best!" : `best ${best}m`}`}
              primary={{ label: "Climb again", onClick: start }}
            >
              <ScoreStatus gameSlug="doodle-jump" status={submitStatus} />
            </GameOverlay>
          )}
        </div>
      </div>
      <div className="shrink-0 mt-2 text-[11px] hidden sm:block text-white/60 text-center">
        <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono">←</kbd>/
        <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono">→</kbd>{" "}
        steer · auto-jump on platforms · tap halves on mobile ·{" "}
        <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono">P</kbd>{" "}
        pauses
      </div>
    </div>
  );
}

// =================================================================
// ----- DRAW HELPERS ---------------------------------------------
// =================================================================

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  facing: 1 | -1,
  pvy: number,
  squashFor: number,
  rocketing: boolean,
) {
  // Squash on landing — vertical compression, horizontal stretch
  const squash = squashFor > 0 ? 1 - squashFor / 0.18 : 0;
  const sx = 1 + squash * 0.25;
  const sy = 1 - squash * 0.25;
  // Stretch when rising fast (visual cue for spring/rocket)
  const stretch = pvy < -400 ? Math.min(0.18, (-pvy - 400) / 1200) : 0;
  const fx = sx * (1 - stretch * 0.4);
  const fy = sy * (1 + stretch);

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing * fx, fy);

  // Rocket: visible flames behind the body when active
  if (rocketing) {
    ctx.fillStyle = "#fde68a";
    ctx.beginPath();
    ctx.ellipse(0, 18, 7, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f97316";
    ctx.beginPath();
    ctx.ellipse(0, 22, 5, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // Rocket strapped on the back
    ctx.fillStyle = "#cbd5e1";
    roundRect(ctx, -10, -10, 20, 24, 6);
    ctx.fill();
    ctx.fillStyle = "#94a3b8";
    ctx.fillRect(-4, -12, 8, 4);
  }

  // Body — pill-shaped lime green creature
  const bodyGrad = ctx.createRadialGradient(-4, -6, 4, 0, 0, 22);
  bodyGrad.addColorStop(0, "#a3e635");
  bodyGrad.addColorStop(1, "#65a30d");
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, 16, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#3f6212";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Eye
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.arc(7, -4, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#3f6212";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#0a0a0a";
  ctx.beginPath();
  ctx.arc(8.5, -3, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.arc(9.5, -4, 0.8, 0, Math.PI * 2);
  ctx.fill();

  // Smile
  ctx.strokeStyle = "#3f6212";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(2, 4, 4, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();

  // Tiny legs poking down
  ctx.fillStyle = "#3f6212";
  ctx.fillRect(-7, 14, 4, 5);
  ctx.fillRect(3, 14, 4, 5);

  ctx.restore();
}

function drawPlatform(
  ctx: CanvasRenderingContext2D,
  p: Platform,
  screenY: number,
  alpha: number,
) {
  ctx.globalAlpha = alpha;
  let topColor: string;
  let bodyColor: string;
  let strokeColor: string;
  if (p.kind === "static") {
    topColor = "#86efac";
    bodyColor = "#16a34a";
    strokeColor = "#166534";
  } else if (p.kind === "moving") {
    topColor = "#93c5fd";
    bodyColor = "#3b82f6";
    strokeColor = "#1e40af";
  } else if (p.kind === "breakable") {
    topColor = "#fee2e2";
    bodyColor = "#fca5a5";
    strokeColor = "#991b1b";
  } else {
    topColor = "#bef264";
    bodyColor = "#65a30d";
    strokeColor = "#365314";
  }
  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  roundRect(ctx, p.x + 2, screenY + 3, p.w, p.h, 6);
  ctx.fill();
  // Body
  const grad = ctx.createLinearGradient(0, screenY, 0, screenY + p.h);
  grad.addColorStop(0, topColor);
  grad.addColorStop(1, bodyColor);
  ctx.fillStyle = grad;
  roundRect(ctx, p.x, screenY, p.w, p.h, 6);
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Top sheen
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  roundRect(ctx, p.x + 4, screenY + 2, p.w - 8, 2, 1);
  ctx.fill();
  // Kind-specific embellishments
  if (p.kind === "moving") {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    const ax = p.vx > 0 ? p.x + p.w - 12 : p.x + 8;
    const dir = p.vx > 0 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(ax, screenY + p.h / 2);
    ctx.lineTo(ax - 4 * dir, screenY + 4);
    ctx.lineTo(ax - 4 * dir, screenY + p.h - 4);
    ctx.closePath();
    ctx.fill();
  } else if (p.kind === "breakable") {
    // Cracks
    ctx.strokeStyle = "rgba(127, 29, 29, 0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x + p.w * 0.25, screenY + 2);
    ctx.lineTo(p.x + p.w * 0.4, screenY + p.h - 2);
    ctx.moveTo(p.x + p.w * 0.7, screenY + 3);
    ctx.lineTo(p.x + p.w * 0.55, screenY + p.h - 3);
    ctx.stroke();
  } else if (p.kind === "spring") {
    // Coil drawn on top of the platform
    ctx.strokeStyle = "#a3e635";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const sx = p.x + p.w / 2;
    for (let i = 0; i < 4; i++) {
      const yy = screenY - 2 - i * 3;
      ctx.moveTo(sx - 5, yy);
      ctx.lineTo(sx + 5, yy);
    }
    ctx.stroke();
    ctx.fillStyle = "#a3e635";
    ctx.fillRect(sx - 7, screenY - 18, 14, 3);
  }
  // Rocket powerup
  if (p.powerup === "rocket" && p.alive) {
    const rx = p.x + p.w / 2;
    const ry = screenY - 18;
    ctx.fillStyle = "#cbd5e1";
    roundRect(ctx, rx - 6, ry - 6, 12, 16, 4);
    ctx.fill();
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.moveTo(rx, ry - 12);
    ctx.lineTo(rx + 6, ry - 6);
    ctx.lineTo(rx - 6, ry - 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#fde68a";
    ctx.fillRect(rx - 3, ry + 8, 6, 4);
  }
  ctx.globalAlpha = 1;
}

function drawCoin(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  phase: number,
) {
  const wob = 1 + 0.18 * Math.sin(phase);
  ctx.save();
  ctx.translate(x, y);
  // Halo
  const g = ctx.createRadialGradient(0, 0, 3, 0, 0, 14);
  g.addColorStop(0, "rgba(252,211,77,0.65)");
  g.addColorStop(1, "rgba(252,211,77,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fill();
  // Coin
  ctx.scale(wob, 1);
  ctx.fillStyle = "#facc15";
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#a16207";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.beginPath();
  ctx.arc(-2, -2, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEnemy(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  e: Enemy,
) {
  if (!e.alive) {
    // Brief squash poof
    const a = Math.max(0, e.squashedFor / 0.4);
    ctx.fillStyle = `rgba(239,68,68,${a * 0.8})`;
    ctx.beginPath();
    ctx.arc(x, y, 16 * (1 - a) + 6, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  // Wing flap
  const wing = Math.sin(e.flapPhase) * 6;
  ctx.fillStyle = "#7c2d12";
  ctx.beginPath();
  ctx.ellipse(-10, wing, 8, 5, -0.4, 0, Math.PI * 2);
  ctx.ellipse(10, -wing, 8, 5, 0.4, 0, Math.PI * 2);
  ctx.fill();
  // Body — purple monster
  const grad = ctx.createRadialGradient(-3, -4, 3, 0, 0, 18);
  grad.addColorStop(0, "#c084fc");
  grad.addColorStop(1, "#7c3aed");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, 0, 14, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#4c1d95";
  ctx.lineWidth = 2;
  ctx.stroke();
  // Eye
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.arc(0, -2, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0a0a0a";
  ctx.beginPath();
  ctx.arc(e.vx > 0 ? 1.5 : -1.5, -1.5, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // Fangs
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.moveTo(-3, 6);
  ctx.lineTo(-2, 9);
  ctx.lineTo(-1, 6);
  ctx.closePath();
  ctx.moveTo(1, 6);
  ctx.lineTo(2, 9);
  ctx.lineTo(3, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCloud(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
) {
  const r = w / 4;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.arc(x + r * 0.8, y - r * 0.4, r * 0.9, 0, Math.PI * 2);
  ctx.arc(x + r * 1.6, y, r * 0.8, 0, Math.PI * 2);
  ctx.arc(x + r * 0.6, y + r * 0.3, r * 0.7, 0, Math.PI * 2);
  ctx.fill();
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

function lerpColor(a: string, b: string, t: number) {
  const ah = parseInt(a.slice(1), 16);
  const ar = (ah >> 16) & 0xff;
  const ag = (ah >> 8) & 0xff;
  const ab = ah & 0xff;
  const bh = parseInt(b.slice(1), 16);
  const br = (bh >> 16) & 0xff;
  const bg = (bh >> 8) & 0xff;
  const bb = bh & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
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
          ? "bg-[var(--accent)]/20 border border-[var(--accent)]/40"
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
