"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";
import { GameOverlay, PauseToggle } from "@/components/games/GameOverlay";

const VIEW_W = 800;
const VIEW_H = 220;
const GROUND_Y = 180;
const DINO_X = 64;
const DINO_W = 44;
const DINO_H_RUN = 48;
const DINO_H_DUCK = 28;
const DINO_W_DUCK = 60;
const GRAVITY = 2200;
const JUMP_VEL = -740;
/** Holding ↓ while airborne accelerates the fall — lets the player
 *  punch back down quickly after a misjudged early jump. */
const FAST_FALL_MULT = 2.4;
const SPEED_BASE = 340;
const SPEED_MAX = 720;
const SPEED_RAMP_DURATION = 90;
/** Score units per pixel travelled. Calibrated so a typical run
 *  reaches a few hundred points before things get hard. */
const SCORE_PER_PX = 0.025;

type Cactus = { x: number; w: number; h: number };
type Bird = { x: number; y: number };
type Cloud = { x: number; y: number; parallax: number };
type Tick = { x: number; offset: number };

type State = {
  dinoY: number; // y of bbox top
  dinoVy: number;
  cacti: Cactus[];
  birds: Bird[];
  clouds: Cloud[];
  ticks: Tick[];
  speed: number;
  distance: number;
  obsCooldown: number;
  cloudCooldown: number;
  legPhase: number;
  birdFlap: number;
  elapsed: number;
};

function emptyState(): State {
  return {
    dinoY: GROUND_Y - DINO_H_RUN,
    dinoVy: 0,
    cacti: [],
    birds: [],
    clouds: [],
    ticks: [],
    speed: SPEED_BASE,
    distance: 0,
    obsCooldown: 480,
    cloudCooldown: 200,
    legPhase: 0,
    birdFlap: 0,
    elapsed: 0,
  };
}

export default function ChromeDino() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState(false);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const submitStatus = useSubmitScoreOnGameOver("chrome-dino", score, over);

  const startedRef = useRef(false);
  startedRef.current = started;
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const overRef = useRef(false);
  overRef.current = over;
  const bestRef = useRef(0);
  bestRef.current = best;
  const scoreRef = useRef(0);
  scoreRef.current = score;

  const stateRef = useRef<State>(emptyState());
  const inputRef = useRef({ duckHeld: false });

  useEffect(() => {
    setBest(Number(localStorage.getItem("nexplay:chrome-dino-best") || 0));
  }, []);

  const reset = useCallback(() => {
    stateRef.current = emptyState();
    inputRef.current.duckHeld = false;
    setScore(0);
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

  const tryJump = useCallback(() => {
    const st = stateRef.current;
    const onGround = st.dinoY >= GROUND_Y - DINO_H_RUN - 0.5;
    if (onGround) {
      st.dinoVy = JUMP_VEL;
    }
  }, []);

  // Keyboard
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        e.preventDefault();
        togglePause();
        return;
      }
      if (overRef.current) {
        if (e.key === " " || e.key === "Enter" || e.key === "ArrowUp") {
          e.preventDefault();
          start();
        }
        return;
      }
      if (!startedRef.current) {
        if (e.key === " " || e.key === "Enter" || e.key === "ArrowUp") {
          e.preventDefault();
          start();
        }
        return;
      }
      if (pausedRef.current) return;
      if (e.key === " " || e.key === "ArrowUp") {
        e.preventDefault();
        tryJump();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        inputRef.current.duckHeld = true;
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") inputRef.current.duckHeld = false;
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [togglePause, start, tryJump]);

  // Pointer / touch — tap anywhere on the play area to jump (or
  // restart from the game-over state).
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onDown = () => {
      if (overRef.current || !startedRef.current) {
        start();
        return;
      }
      if (pausedRef.current) return;
      tryJump();
    };
    wrap.addEventListener("pointerdown", onDown);
    return () => wrap.removeEventListener("pointerdown", onDown);
  }, [tryJump, start]);

  // Main loop
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();

    const triggerGameOver = () => {
      if (overRef.current) return;
      setOver(true);
      const finalScore = scoreRef.current;
      const nb = Math.max(bestRef.current, finalScore);
      if (nb !== bestRef.current) {
        setBest(nb);
        localStorage.setItem("nexplay:chrome-dino-best", String(nb));
      }
    };

    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      const live = startedRef.current && !pausedRef.current && !overRef.current;

      // Theme colours read fresh each frame so toggling the site
      // theme during a run reflows immediately.
      const root = getComputedStyle(document.documentElement);
      const fg = root.getPropertyValue("--foreground").trim() || "#0a0a0f";
      const muted = root.getPropertyValue("--muted").trim() || "#71717a";
      const bg = root.getPropertyValue("--background").trim() || "#faf8f3";
      const accent = root.getPropertyValue("--accent").trim() || "#7c5cff";

      if (live) {
        st.elapsed += dt;
        const t = Math.min(1, st.elapsed / SPEED_RAMP_DURATION);
        st.speed = SPEED_BASE + (SPEED_MAX - SPEED_BASE) * t;

        const dx = st.speed * dt;
        st.distance += dx;
        scoreRef.current = Math.floor(st.distance * SCORE_PER_PX);
        setScore(scoreRef.current);

        // Dino physics
        const onGround = st.dinoY >= GROUND_Y - DINO_H_RUN - 0.5;
        const fastFall = inputRef.current.duckHeld && !onGround;
        const g = fastFall ? GRAVITY * FAST_FALL_MULT : GRAVITY;
        st.dinoVy += g * dt;
        st.dinoY += st.dinoVy * dt;
        if (st.dinoY > GROUND_Y - DINO_H_RUN) {
          st.dinoY = GROUND_Y - DINO_H_RUN;
          st.dinoVy = 0;
        }

        // Spawn obstacles
        st.obsCooldown -= dx;
        if (st.obsCooldown <= 0) {
          const minGap = Math.max(180, 460 - st.elapsed * 2.5);
          st.obsCooldown = minGap + Math.random() * 260;
          if (Math.random() < 0.65 || st.elapsed < 8) {
            const sizes = [
              { w: 16, h: 32 },
              { w: 22, h: 42 },
              { w: 36, h: 42 },
            ];
            const s = sizes[Math.floor(Math.random() * 3)];
            st.cacti.push({ x: VIEW_W + 20, w: s.w, h: s.h });
          } else {
            const heights = [GROUND_Y - 80, GROUND_Y - 50, GROUND_Y - 22];
            st.birds.push({
              x: VIEW_W + 30,
              y: heights[Math.floor(Math.random() * heights.length)],
            });
          }
        }
        for (let i = st.cacti.length - 1; i >= 0; i--) {
          st.cacti[i].x -= dx;
          if (st.cacti[i].x + st.cacti[i].w < 0) st.cacti.splice(i, 1);
        }
        for (let i = st.birds.length - 1; i >= 0; i--) {
          st.birds[i].x -= dx * 1.05;
          if (st.birds[i].x + 38 < 0) st.birds.splice(i, 1);
        }

        // Clouds (parallax — they drift slower than the ground)
        st.cloudCooldown -= dx;
        if (st.cloudCooldown <= 0) {
          st.cloudCooldown = 280 + Math.random() * 280;
          st.clouds.push({
            x: VIEW_W + 30,
            y: 24 + Math.random() * 70,
            parallax: 0.22 + Math.random() * 0.18,
          });
        }
        for (let i = st.clouds.length - 1; i >= 0; i--) {
          const c = st.clouds[i];
          c.x -= dx * c.parallax;
          if (c.x + 50 < 0) st.clouds.splice(i, 1);
        }

        // Ground texture — every ~50px lay a fresh tick at the right
        // edge, drift it left with the world.
        if (st.ticks.length === 0 || st.ticks[st.ticks.length - 1].x < VIEW_W) {
          st.ticks.push({
            x: (st.ticks[st.ticks.length - 1]?.x ?? -50) + 50,
            offset: Math.random() * 16,
          });
        }
        for (let i = st.ticks.length - 1; i >= 0; i--) {
          st.ticks[i].x -= dx;
          if (st.ticks[i].x < -30) st.ticks.splice(i, 1);
        }

        st.legPhase = (st.legPhase + dt * (st.speed / 70)) % 1;
        st.birdFlap = (st.birdFlap + dt * 6) % 1;

        // Collision (generous hitbox — shrunk by 4–6px each side)
        const ducking = inputRef.current.duckHeld && onGround;
        const dinoH = ducking ? DINO_H_DUCK : DINO_H_RUN;
        const dinoW = ducking ? DINO_W_DUCK : DINO_W;
        const dinoTop = ducking ? GROUND_Y - DINO_H_DUCK : st.dinoY;
        const hb = {
          x: DINO_X + 6,
          y: dinoTop + 4,
          w: dinoW - 12,
          h: dinoH - 8,
        };
        for (const c of st.cacti) {
          if (
            rectsOverlap(hb, { x: c.x + 2, y: GROUND_Y - c.h, w: c.w - 4, h: c.h })
          ) {
            triggerGameOver();
            break;
          }
        }
        if (!overRef.current) {
          for (const b of st.birds) {
            if (rectsOverlap(hb, { x: b.x + 4, y: b.y + 2, w: 30, h: 12 })) {
              triggerGameOver();
              break;
            }
          }
        }
      }

      // ---- DRAW ----
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);

      // Clouds (faded)
      ctx.fillStyle = fg;
      ctx.globalAlpha = 0.18;
      for (const c of st.clouds) drawCloud(ctx, c.x, c.y);
      ctx.globalAlpha = 1;

      // Ground line
      ctx.strokeStyle = fg;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y);
      ctx.lineTo(VIEW_W, GROUND_Y);
      ctx.stroke();

      // Ground ticks
      ctx.fillStyle = fg;
      for (const t of st.ticks) {
        ctx.fillRect(t.x, GROUND_Y + 4, 6, 2);
        ctx.fillRect(t.x + 14 + (t.offset % 8), GROUND_Y + 8, 4, 2);
      }

      for (const c of st.cacti) drawCactus(ctx, c, fg);
      for (const b of st.birds) drawBird(ctx, b, st.birdFlap, fg);

      const onGroundDraw = st.dinoY >= GROUND_Y - DINO_H_RUN - 0.5;
      const dinoColor = overRef.current ? "#ef4444" : fg;
      drawDino(ctx, st, onGroundDraw, inputRef.current.duckHeld, dinoColor, bg);

      // Score readout
      ctx.fillStyle = muted;
      ctx.font = 'bold 14px ui-monospace, "SF Mono", Menlo, monospace';
      ctx.textAlign = "right";
      const hi = Math.max(bestRef.current, scoreRef.current);
      ctx.fillText(
        `HI ${String(hi).padStart(5, "0")}    ${String(scoreRef.current).padStart(5, "0")}`,
        VIEW_W - 16,
        28,
      );

      if (overRef.current) {
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.08;
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
        ctx.globalAlpha = 1;
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="absolute inset-0 flex flex-col bg-[var(--background)] text-[var(--foreground)] p-2 sm:p-3 select-none">
      <div className="shrink-0 flex items-center justify-center gap-2 mb-2 text-xs flex-wrap">
        <Stat label="Score" value={score} accent />
        <Stat label="Best" value={best} />
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
            className="absolute inset-0 w-full h-full block rounded-xl border border-[var(--border)] cursor-pointer"
          />
          {!started && !over && (
            <GameOverlay
              icon="🦖"
              title="Chrome Dino"
              subtitle={
                <>
                  Jump cacti, duck pterodactyls.{" "}
                  <kbd className="px-1 py-0.5 rounded bg-white/15 border border-white/25 text-white font-mono">
                    Space
                  </kbd>{" "}
                  /{" "}
                  <kbd className="px-1 py-0.5 rounded bg-white/15 border border-white/25 text-white font-mono">
                    ↑
                  </kbd>{" "}
                  to jump,{" "}
                  <kbd className="px-1 py-0.5 rounded bg-white/15 border border-white/25 text-white font-mono">
                    ↓
                  </kbd>{" "}
                  to duck. Tap to play on mobile.
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
              title="Game over"
              subtitle={`Score ${score} · Best ${Math.max(best, score)}`}
              primary={{ label: "Play again", onClick: start }}
            >
              <ScoreStatus gameSlug="chrome-dino" status={submitStatus} />
            </GameOverlay>
          )}
        </div>
      </div>
      <div className="shrink-0 mt-2 text-[11px] text-[var(--muted)] text-center">
        <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--foreground)] font-mono font-semibold">
          Space
        </kbd>
        {" / "}
        <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--foreground)] font-mono font-semibold">
          ↑
        </kbd>{" "}
        jump ·{" "}
        <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--foreground)] font-mono font-semibold">
          ↓
        </kbd>{" "}
        duck · tap on mobile ·{" "}
        <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--foreground)] font-mono font-semibold">
          P
        </kbd>{" "}
        pauses
      </div>
    </div>
  );
}

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

/** Draw the dino in running, jumping, or ducking pose. Built from
 *  rectangles for a pixel-art silhouette. The key shapes that make
 *  it read as "dinosaur" rather than "blob": a head with a snout
 *  protruding forward of the body, a small T-Rex arm tucked at the
 *  belly, a tail stub at the back, and clearly alternating legs.
 *  Holes (eye-white aside, mouth, leg gap) are painted with `bg`
 *  rather than clearRect so the canvas stays opaque. */
function drawDino(
  ctx: CanvasRenderingContext2D,
  st: State,
  onGround: boolean,
  duckHeld: boolean,
  color: string,
  bg: string,
) {
  const dx = DINO_X;
  const ducking = duckHeld && onGround;

  if (ducking) {
    // ---- DUCKING POSE — body slung low, head reaching out ----
    const dy = GROUND_Y - DINO_H_DUCK;
    ctx.fillStyle = color;
    // Tail stub
    ctx.fillRect(dx + 0, dy + 10, 6, 6);
    ctx.fillRect(dx + 4, dy + 14, 4, 4);
    // Body (long horizontal)
    ctx.fillRect(dx + 4, dy + 8, 36, 14);
    // Head extending forward
    ctx.fillRect(dx + 36, dy + 4, 16, 14);
    // Snout protrusion (forward)
    ctx.fillRect(dx + 50, dy + 8, 8, 6);
    ctx.fillRect(dx + 56, dy + 10, 4, 4);
    // Eye
    ctx.fillStyle = "#fff";
    ctx.fillRect(dx + 44, dy + 7, 4, 4);
    ctx.fillStyle = color;
    ctx.fillRect(dx + 45, dy + 8, 2, 2);
    // Mouth gap
    ctx.fillStyle = bg;
    ctx.fillRect(dx + 50, dy + 14, 6, 2);
    ctx.fillStyle = color;
    // Legs alternating
    const phase = Math.floor(st.legPhase * 2);
    if (phase === 0) {
      ctx.fillRect(dx + 10, dy + 22, 4, 6);
      ctx.fillRect(dx + 26, dy + 22, 4, 6);
    } else {
      ctx.fillRect(dx + 14, dy + 22, 4, 6);
      ctx.fillRect(dx + 30, dy + 22, 4, 6);
    }
    return;
  }

  // ---- STANDING / RUNNING / JUMPING POSE ----
  const dy = st.dinoY;
  ctx.fillStyle = color;

  // Tail (small stub at the back)
  ctx.fillRect(dx + 0, dy + 16, 6, 4);
  ctx.fillRect(dx + 2, dy + 20, 4, 2);

  // Body — back, midsection, haunches
  ctx.fillRect(dx + 4, dy + 14, 22, 6); // upper back
  ctx.fillRect(dx + 6, dy + 20, 24, 12); // mid body
  ctx.fillRect(dx + 10, dy + 32, 18, 6); // haunches

  // Head — square block with brow line on top
  ctx.fillRect(dx + 20, dy + 2, 20, 18);
  ctx.fillRect(dx + 22, dy + 0, 14, 4); // brow

  // Snout — the protrusion that reads as "dinosaur head"
  ctx.fillRect(dx + 38, dy + 8, 6, 8);
  ctx.fillRect(dx + 42, dy + 10, 2, 4);

  // Eye + pupil
  ctx.fillStyle = "#fff";
  ctx.fillRect(dx + 28, dy + 6, 4, 4);
  ctx.fillStyle = color;
  ctx.fillRect(dx + 30, dy + 7, 2, 2);

  // Mouth (painted in bg so the canvas stays opaque)
  ctx.fillStyle = bg;
  ctx.fillRect(dx + 34, dy + 14, 6, 2);
  ctx.fillStyle = color;

  // Tiny T-Rex arm tucked under the chest
  ctx.fillRect(dx + 22, dy + 22, 4, 4);
  ctx.fillRect(dx + 20, dy + 24, 6, 2);

  // Legs
  if (onGround) {
    const phase = Math.floor(st.legPhase * 2);
    if (phase === 0) {
      // Front leg planted, back leg lifted
      ctx.fillRect(dx + 12, dy + 38, 6, 10);
      ctx.fillRect(dx + 10, dy + 46, 10, 2);
      ctx.fillRect(dx + 22, dy + 38, 6, 6);
    } else {
      // Front leg lifted, back leg planted
      ctx.fillRect(dx + 12, dy + 38, 6, 6);
      ctx.fillRect(dx + 22, dy + 38, 6, 10);
      ctx.fillRect(dx + 20, dy + 46, 10, 2);
    }
  } else {
    // Airborne — both legs tucked, feet together
    ctx.fillRect(dx + 12, dy + 38, 6, 8);
    ctx.fillRect(dx + 10, dy + 44, 10, 2);
    ctx.fillRect(dx + 22, dy + 38, 6, 8);
    ctx.fillRect(dx + 20, dy + 44, 10, 2);
  }
}

function drawCactus(
  ctx: CanvasRenderingContext2D,
  c: Cactus,
  color: string,
) {
  ctx.fillStyle = color;
  // Main trunk
  ctx.fillRect(c.x, GROUND_Y - c.h, c.w, c.h);
  // Pixel notches for texture
  ctx.clearRect(c.x + 4, GROUND_Y - c.h + 6, 2, 4);
  ctx.clearRect(c.x + c.w - 6, GROUND_Y - c.h + 14, 2, 6);
  // Arms on the wider variants
  if (c.w >= 22) {
    ctx.fillRect(c.x - 4, GROUND_Y - c.h + 8, 4, 12);
    ctx.fillRect(c.x + c.w, GROUND_Y - c.h + 14, 4, 10);
  }
}

function drawBird(
  ctx: CanvasRenderingContext2D,
  b: Bird,
  flap: number,
  color: string,
) {
  ctx.fillStyle = color;
  // Body
  ctx.fillRect(b.x, b.y + 4, 30, 8);
  // Head
  ctx.fillRect(b.x + 26, b.y, 10, 8);
  // Beak
  ctx.fillRect(b.x + 36, b.y + 3, 4, 2);
  // Tail
  ctx.fillRect(b.x - 4, b.y + 6, 4, 4);
  // Wings — flap up or down
  if (flap < 0.5) {
    ctx.fillRect(b.x + 6, b.y - 6, 14, 8);
  } else {
    ctx.fillRect(b.x + 6, b.y + 12, 14, 6);
  }
}

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillRect(x, y, 32, 6);
  ctx.fillRect(x + 6, y - 4, 22, 6);
  ctx.fillRect(x + 24, y + 4, 12, 4);
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
          : "bg-[var(--surface-2)] border border-[var(--border)]"
      }`}
    >
      <span className="text-[10px] uppercase tracking-wider opacity-60 mr-1.5">
        {label}
      </span>
      <b>{value}</b>
    </span>
  );
}
