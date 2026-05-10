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

// 1 = wall, 0 = floor, 2 = treasure-cell, 3 = exit. Treasures are
// extracted out of the grid into a separate array on reset so each
// one can carry its own kind / animation state, while the grid keeps
// just walls + floor + the exit tile.
const LEVEL: number[][] = [
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
];

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

function makeFreshState() {
  const grid: number[][] = LEVEL.map((row) => [...row]);
  const treasures: Treasure[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] === 2) {
        grid[r][c] = 0; // treasures live in the array, not the grid
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
  return {
    grid,
    treasures,
    px: 1.5,
    py: 1.5,
    facingX: 0,
    facingY: 1, // start facing down
    walkPhase: 0,
    moving: false,
    stepCool: 0,
    elapsed: 0,
    particles: [] as Particle[],
    floaters: [] as Floater[],
    pickupFlash: 0,
    pickupHue: 50,
  };
}

export default function TreasureHunt() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keys = useKeyboard();
  const [collected, setCollected] = useState(0);
  const [total] = useState(LEVEL.flat().filter((v) => v === 2).length);
  const [score, setScore] = useState(0);
  const [time, setTime] = useState(0);
  const [won, setWon] = useState(false);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const finalScore = won ? score + Math.max(0, 800 - time * 5) : 0;
  const submitStatus = useSubmitScoreOnGameOver(
    "treasure-hunt",
    finalScore,
    won,
  );
  const startedRef = useRef(false);
  startedRef.current = started;
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const wonRef = useRef(false);
  wonRef.current = won;

  const stateRef = useRef(makeFreshState());

  const reset = useCallback(() => {
    stateRef.current = makeFreshState();
    setCollected(0);
    setScore(0);
    setTime(0);
    setWon(false);
    setStarted(false);
    setPaused(false);
  }, []);

  const start = useCallback(() => {
    stateRef.current = makeFreshState();
    setCollected(0);
    setScore(0);
    setTime(0);
    setWon(false);
    setStarted(true);
    setPaused(false);
  }, []);

  const togglePause = useCallback(() => {
    if (wonRef.current || !startedRef.current) return;
    setPaused((p) => !p);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePause]);

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

    const tryMove = (dx: number, dy: number) => {
      const st = stateRef.current;
      if (dx === 0 && dy === 0) return;
      const nx = st.px + dx;
      const ny = st.py + dy;
      // Wall test on the *new* position's grid cell
      const cx = Math.floor(nx);
      const cy = Math.floor(ny);
      if (st.grid[cy]?.[cx] === 1) return;
      st.px = nx;
      st.py = ny;
      checkPickups();
      // Exit
      const cell = st.grid[Math.floor(st.py)]?.[Math.floor(st.px)];
      if (cell === 3 && !wonRef.current) {
        setWon(true);
        Sfx.win();
      }
    };

    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      const k = keys.current;
      const live =
        startedRef.current && !pausedRef.current && !wonRef.current;

      // Always-tick decays so flashes / floaters don't get stuck
      if (st.pickupFlash > 0)
        st.pickupFlash = Math.max(0, st.pickupFlash - dt * 3);
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
        setTime(Math.floor(st.elapsed));

        const speed = 5; // cells per second
        let dx = 0;
        let dy = 0;
        if (k.has("ArrowLeft") || k.has("a")) dx -= 1;
        if (k.has("ArrowRight") || k.has("d")) dx += 1;
        if (k.has("ArrowUp") || k.has("w")) dy -= 1;
        if (k.has("ArrowDown") || k.has("s")) dy += 1;
        const moving = dx !== 0 || dy !== 0;
        st.moving = moving;
        if (moving) {
          const len = Math.hypot(dx, dy) || 1;
          // Track facing for the sprite (and the torch)
          st.facingX = dx / len;
          st.facingY = dy / len;
          // Move x and y separately so we can slide along walls
          tryMove((dx / len) * speed * dt, 0);
          tryMove(0, (dy / len) * speed * dt);
          // Walking animation cycle + footstep ticks
          st.walkPhase = (st.walkPhase + dt * 7) % 1;
          st.stepCool -= dt;
          if (st.stepCool <= 0) {
            st.stepCool = 0.32; // ~3 footsteps per second
            Sfx.step();
          }
        } else {
          st.stepCool = 0;
          // Idle: legs slowly settle
          st.walkPhase = 0;
        }
      }

      // ============================================================
      // ----- DRAW -------------------------------------------------
      // ============================================================
      // Backdrop — cave gradient
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#1a1208");
      bg.addColorStop(1, "#0b0d12");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Floor + walls
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const v = st.grid[r][c];
          const x = c * CELL;
          const y = r * CELL;
          if (v === 1) {
            // Stone wall — darker base + top highlight + occasional
            // mortar line so it doesn't read as one flat slab
            ctx.fillStyle = "#2a1f12";
            ctx.fillRect(x, y, CELL, CELL);
            ctx.fillStyle = "rgba(255,255,255,0.05)";
            ctx.fillRect(x, y, CELL, 4);
            ctx.fillStyle = "rgba(0,0,0,0.35)";
            ctx.fillRect(x, y + CELL - 3, CELL, 3);
            // Stone block seams
            if ((c + r) % 2 === 0) {
              ctx.strokeStyle = "rgba(0,0,0,0.35)";
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(x, y + CELL / 2);
              ctx.lineTo(x + CELL, y + CELL / 2);
              ctx.stroke();
            }
          } else {
            // Floor — soft brown with subtle dot pattern
            ctx.fillStyle = "#15110a";
            ctx.fillRect(x, y, CELL, CELL);
            if ((c * 7 + r * 13) % 5 === 0) {
              ctx.fillStyle = "rgba(255,200,140,0.04)";
              ctx.fillRect(x + 6, y + 8, 2, 2);
            }
          }
        }
      }

      // Exit — pulsing green portal
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (st.grid[r][c] !== 3) continue;
          const x = c * CELL;
          const y = r * CELL;
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
          // Doorway
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

      // Player — drawn last so they sit on top
      drawPlayer(
        ctx,
        st.px * CELL,
        st.py * CELL,
        st.facingX,
        st.facingY,
        st.walkPhase,
        st.moving,
      );

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

      // Pickup vignette flash
      if (st.pickupFlash > 0) {
        ctx.fillStyle = `hsla(${st.pickupHue}, 90%, 70%, ${st.pickupFlash * 0.25})`;
        ctx.fillRect(0, 0, W, H);
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#1a1208] to-[#0b0d12] p-2 sm:p-3">
      <div className="shrink-0 flex items-center justify-center gap-2 mb-2 text-white text-xs sm:text-sm flex-wrap">
        <Stat label="Score" value={score} accent />
        <Stat label="Loot" value={`${collected}/${total}`} icon="💎" />
        <Stat label="Time" value={`${time}s`} icon="⏱️" />
        <SoundToggle />
        {started && !won && (
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
          {!started && !won && (
            <GameOverlay
              icon="🗺️"
              title="Treasure Hunt"
              subtitle={
                <>
                  Guide the explorer through the cave. Coins, gems, and
                  chests all bank score; the green portal is the way
                  out, and finishing faster pays a time bonus.
                </>
              }
              primary={{ label: "▶ Begin", onClick: start }}
            />
          )}
          {paused && started && !won && (
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
          {won && (
            <GameOverlay
              icon="🏆"
              title="Escaped the cave!"
              subtitle={`${collected}/${total} treasures · ${time}s · time bonus +${Math.max(0, 800 - time * 5)}`}
              primary={{ label: "Run again", onClick: start }}
            >
              <div className="text-3xl font-black text-amber-400">
                Score: {finalScore}
              </div>
              <ScoreStatus gameSlug="treasure-hunt" status={submitStatus} />
            </GameOverlay>
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

/** Top-down explorer sprite — head, hat, jacket body, animated legs,
 *  and a torch glow positioned in the facing direction so the
 *  player reads as someone walking through a cave rather than as a
 *  ball. */
function drawPlayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  facingX: number,
  facingY: number,
  walkPhase: number,
  moving: boolean,
) {
  // Stride offset for legs (sin wave during movement, 0 when idle)
  const stride = moving ? Math.sin(walkPhase * Math.PI * 2) * 2.2 : 0;

  // Torch — small glow ahead of the player, in the direction of
  // travel. Drawn before the body so the body sits inside the glow.
  const tlen = 9;
  const tFx = (facingX || 0) * tlen;
  const tFy = (facingY || 0) * tlen;
  // If standing still and never moved, default the torch to "down"
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

  // Backpack (sits behind the body — drawn first)
  ctx.fillStyle = "#5a3a1a";
  roundRect(ctx, x - 5, y - 1, 10, 7, 1.5);
  ctx.fill();
  ctx.fillStyle = "#3a2810";
  ctx.fillRect(x - 5, y + 2, 10, 1.5);

  // Legs (alternating during walk — visible below the body)
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

  // Head (skin tone)
  ctx.fillStyle = "#e4b896";
  ctx.beginPath();
  ctx.arc(x, y - 4, 5, 0, Math.PI * 2);
  ctx.fill();

  // Hat (adventurer's hat — brim + crown)
  ctx.fillStyle = "#3a2810";
  // Brim — wide ellipse
  ctx.beginPath();
  ctx.ellipse(x, y - 5, 7, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Crown — small dome on top
  ctx.beginPath();
  ctx.arc(x, y - 7, 3.5, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6b4a25";
  ctx.fillRect(x - 3.5, y - 6, 7, 0.8);

  // Torch flame (small bright dot at the torch position)
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
    // Glow
    const g = ctx.createRadialGradient(0, 0, 3, 0, 0, 14);
    g.addColorStop(0, "rgba(252,211,77,0.7)");
    g.addColorStop(1, "rgba(252,211,77,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    // Edge-on coin (squashed when wob is high)
    ctx.scale(wob, 1);
    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fde68a";
    ctx.beginPath();
    ctx.arc(-1.5, -2, 2, 0, Math.PI * 2);
    ctx.fill();
    // $ glyph
    ctx.fillStyle = "rgba(120, 80, 0, 0.85)";
    ctx.font = "bold 8px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("$", 0, 1);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  } else if (kind === "gem") {
    // Pulsing aura
    const g = ctx.createRadialGradient(0, 0, 3, 0, 0, 18);
    g.addColorStop(0, "rgba(167,139,250,0.85)");
    g.addColorStop(1, "rgba(167,139,250,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(phase * 0.4);
    // Diamond facets
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
    // Chest — wooden box with iron straps and a gold lock; bobs
    // gently
    const bob = Math.sin(phase) * 1;
    ctx.translate(0, bob);
    // Glow
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 22);
    g.addColorStop(0, "rgba(245,158,11,0.55)");
    g.addColorStop(1, "rgba(245,158,11,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fill();
    // Body
    ctx.fillStyle = "#7a4a1a";
    roundRect(ctx, -10, -3, 20, 12, 2);
    ctx.fill();
    // Lid
    ctx.fillStyle = "#5a3410";
    roundRect(ctx, -10, -8, 20, 6, 2);
    ctx.fill();
    // Iron straps
    ctx.fillStyle = "#3a3a3a";
    ctx.fillRect(-10, -2, 20, 1.5);
    ctx.fillRect(-9, -8, 1.5, 17);
    ctx.fillRect(7.5, -8, 1.5, 17);
    // Gold lock
    ctx.fillStyle = "#facc15";
    ctx.fillRect(-2.5, -3, 5, 4);
    ctx.fillStyle = "#92400e";
    ctx.fillRect(-1, -1, 2, 2);
    // Glint
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
