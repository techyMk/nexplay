"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";
import { GameOverlay, PauseToggle } from "@/components/games/GameOverlay";

const VIEW_W = 600;
const VIEW_H = 600;
/** Perpendicular distance from hex centre to each face. Stacks
 *  start growing outward from this radius. */
const HEX_APOTHEM = 64;
/** Hex side length — sets the maximum block extent along the face. */
const HEX_SIDE = (HEX_APOTHEM * 2) / Math.sqrt(3);
/** Visual width of a block along its face. Narrower than HEX_SIDE so
 *  blocks read as discrete tiles with clear gaps between adjacent
 *  faces, instead of melting into one continuous ring. */
const BLOCK_W = HEX_SIDE * 0.6;
/** Radial depth of one stacked block. */
const BLOCK_H = 22;
/** Difficulty ramp parameters. fallSpeed and spawnInterval move
 *  continuously from "dead slow" at t=0 to "dead fast" near
 *  RAMP_DURATION, so a single run flows smoothly from chill into
 *  frantic without level-based step changes. */
const RAMP_DURATION = 150;
const FALL_SPEED_MIN = 28;
const FALL_SPEED_MAX = 195;
const SPAWN_INTERVAL_MAX = 1.7;
const SPAWN_INTERVAL_MIN = 0.45;
/** Stack length (in blocks) at which any face overflowing ends the
 *  game. Drawn as a dashed danger ring. */
const MAX_STACK = 6;
const ROT_STEP = Math.PI / 3;
/** Initial radial position of a freshly-spawned falling block —
 *  measured outward from the hex apothem. */
const SPAWN_RADIAL = 220;

const COLORS: { hue: number }[] = [
  { hue: 320 }, // pink
  { hue: 175 }, // cyan
  { hue: 50 }, // yellow
  { hue: 130 }, // green
  { hue: 270 }, // violet
];

type Falling = { id: number; lane: number; color: number; radial: number };
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hue: number;
  life: number;
  max: number;
};
type State = {
  stacks: number[][];
  falling: Falling[];
  nextId: number;
  hexRotSteps: number;
  hexRotVisual: number;
  hexRotTarget: number;
  spawnTimer: number;
  elapsed: number;
  particles: Particle[];
  flash: number;
  shake: number;
};

function emptyState(): State {
  return {
    stacks: [[], [], [], [], [], []],
    falling: [],
    nextId: 0,
    hexRotSteps: 0,
    hexRotVisual: 0,
    hexRotTarget: 0,
    spawnTimer: 1.0,
    elapsed: 0,
    particles: [],
    flash: 0,
    shake: 0,
  };
}

export default function Hextris() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState(false);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const submitStatus = useSubmitScoreOnGameOver("hextris", score, over);

  const startedRef = useRef(false);
  startedRef.current = started;
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const overRef = useRef(false);
  overRef.current = over;
  const levelRef = useRef(1);
  levelRef.current = level;

  const stateRef = useRef<State>(emptyState());

  useEffect(() => {
    setBest(Number(localStorage.getItem("nexplay:hextris-best") || 0));
  }, []);

  const reset = useCallback(() => {
    stateRef.current = emptyState();
    setScore(0);
    setLevel(1);
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

  const rotate = useCallback((dir: 1 | -1) => {
    const s = stateRef.current;
    s.hexRotTarget += dir * ROT_STEP;
    s.hexRotSteps = ((s.hexRotSteps + dir) % 6 + 6) % 6;
  }, []);

  useEffect(() => {
    reset();
  }, [reset]);

  // Keyboard
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        e.preventDefault();
        togglePause();
        return;
      }
      if (overRef.current || !startedRef.current || pausedRef.current) return;
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        e.preventDefault();
        rotate(-1);
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        e.preventDefault();
        rotate(1);
      }
    };
    window.addEventListener("keydown", onDown);
    return () => window.removeEventListener("keydown", onDown);
  }, [togglePause, rotate]);

  // Pointer — tap left/right halves of the canvas to rotate.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onPointer = (e: PointerEvent) => {
      if (overRef.current || !startedRef.current || pausedRef.current) return;
      const rect = wrap.getBoundingClientRect();
      const xf = (e.clientX - rect.left) / rect.width;
      rotate(xf < 0.5 ? -1 : 1);
    };
    wrap.addEventListener("pointerdown", onPointer);
    return () => wrap.removeEventListener("pointerdown", onPointer);
  }, [rotate]);

  // Main game loop
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    const cx = VIEW_W / 2;
    const cy = VIEW_H / 2;

    const award = (pts: number) => {
      setScore((prev) => {
        const next = prev + pts;
        setLevel(Math.floor(next / 250) + 1);
        return next;
      });
    };

    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      const live = startedRef.current && !pausedRef.current && !overRef.current;
      const lvl = levelRef.current;

      // Smooth visual rotation toward snapped target
      const k = 1 - Math.exp(-dt * 14);
      st.hexRotVisual += (st.hexRotTarget - st.hexRotVisual) * k;

      if (live) {
        st.elapsed += dt;
        if (st.flash > 0) st.flash = Math.max(0, st.flash - dt * 3);
        if (st.shake > 0) st.shake = Math.max(0, st.shake - dt * 5);

        // Smooth difficulty ramp tied to elapsed time. Eases from
        // 0 → 1 over RAMP_DURATION using ease-out-quad so the first
        // few seconds feel *dead slow* and players settle into the
        // hex before the rain picks up. After the ramp, the curve
        // saturates at "dead fast" rather than snapping to it.
        const t = Math.min(1, st.elapsed / RAMP_DURATION);
        const ease = 1 - (1 - t) * (1 - t);
        const fallSpeed =
          FALL_SPEED_MIN + (FALL_SPEED_MAX - FALL_SPEED_MIN) * ease;
        const baseSpawnInterval =
          SPAWN_INTERVAL_MAX -
          (SPAWN_INTERVAL_MAX - SPAWN_INTERVAL_MIN) * ease;

        // Spawn falling blocks
        st.spawnTimer -= dt;
        if (st.spawnTimer <= 0) {
          st.spawnTimer = baseSpawnInterval * (0.85 + Math.random() * 0.3);
          const lane = Math.floor(Math.random() * 6);
          const color = Math.floor(Math.random() * COLORS.length);
          st.falling.push({
            id: st.nextId++,
            lane,
            color,
            radial: SPAWN_RADIAL,
          });
        }

        // Move falling blocks; land them when they hit the stack top
        for (let i = st.falling.length - 1; i >= 0; i--) {
          const f = st.falling[i];
          f.radial -= fallSpeed * dt;
          const face = ((f.lane - st.hexRotSteps) % 6 + 6) % 6;
          const stackTop = st.stacks[face].length * BLOCK_H;
          if (f.radial <= stackTop) {
            st.stacks[face].push(f.color);
            st.falling.splice(i, 1);
            // Run match cascade — each pass clears all simultaneous
            // matches, then the outer blocks compact down and we look
            // again. Cascade multiplier rewards chained clears.
            let cascade = 1;
            while (true) {
              const cleared = runMatches(st);
              if (cleared.length === 0) break;
              award(cleared.length * 10 * lvl * cascade);
              for (const c of cleared) {
                const angle = c.f * ROT_STEP + st.hexRotVisual;
                const r = HEX_APOTHEM + (c.d + 0.5) * BLOCK_H;
                const px = cx + Math.cos(angle) * r;
                const py = cy + Math.sin(angle) * r;
                const hue = COLORS[c.color].hue;
                for (let p = 0; p < 9; p++) {
                  const a = Math.random() * Math.PI * 2;
                  const sp = 60 + Math.random() * 120;
                  st.particles.push({
                    x: px,
                    y: py,
                    vx: Math.cos(a) * sp,
                    vy: Math.sin(a) * sp,
                    hue,
                    life: 0.55,
                    max: 0.55,
                  });
                }
              }
              if (cleared.length >= 3) st.flash = Math.max(st.flash, 0.55);
              if (cascade >= 2) st.shake = Math.max(st.shake, 0.4);
              cascade++;
            }
            // Game-over check: any face stack overflowed past the
            // danger ring after cascades? You're done.
            let overflow = false;
            for (let fi = 0; fi < 6; fi++) {
              if (st.stacks[fi].length > MAX_STACK) {
                overflow = true;
                break;
              }
            }
            if (overflow && !overRef.current) {
              setOver(true);
              setScore((finalScore) => {
                setBest((b) => {
                  const nb = Math.max(b, finalScore);
                  localStorage.setItem(
                    "nexplay:hextris-best",
                    String(nb),
                  );
                  return nb;
                });
                return finalScore;
              });
            }
          }
        }

        // Particles
        for (let i = st.particles.length - 1; i >= 0; i--) {
          const p = st.particles[i];
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 0.96;
          p.vy *= 0.96;
          p.life -= dt;
          if (p.life <= 0) st.particles.splice(i, 1);
        }
      }

      // ---- DRAW ----
      ctx.fillStyle = "#0a0a18";
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);

      // Backdrop radial glow (under the hex)
      const bg = ctx.createRadialGradient(cx, cy, 30, cx, cy, 360);
      bg.addColorStop(0, "rgba(124,92,255,0.18)");
      bg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);

      // Optional shake on big cascades
      const shakeX = st.shake > 0 ? (Math.random() - 0.5) * st.shake * 8 : 0;
      const shakeY = st.shake > 0 ? (Math.random() - 0.5) * st.shake * 8 : 0;

      // Lane guides — faint radial lines from outside toward the hex
      ctx.save();
      ctx.translate(cx + shakeX, cy + shakeY);
      ctx.lineWidth = 1;
      for (let lane = 0; lane < 6; lane++) {
        ctx.save();
        ctx.rotate(lane * ROT_STEP);
        const grad = ctx.createLinearGradient(
          HEX_APOTHEM,
          0,
          HEX_APOTHEM + SPAWN_RADIAL + 30,
          0,
        );
        grad.addColorStop(0, "rgba(255,255,255,0.14)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = grad;
        ctx.beginPath();
        ctx.moveTo(HEX_APOTHEM + MAX_STACK * BLOCK_H + 6, 0);
        ctx.lineTo(HEX_APOTHEM + SPAWN_RADIAL + 50, 0);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();

      // Threshold (danger) ring — drawn at the hex's current visual rotation
      ctx.save();
      ctx.translate(cx + shakeX, cy + shakeY);
      ctx.strokeStyle = "rgba(255,92,174,0.45)";
      ctx.setLineDash([6, 8]);
      ctx.lineWidth = 1.5;
      drawHexPath(ctx, HEX_APOTHEM + MAX_STACK * BLOCK_H, st.hexRotVisual);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Stacked blocks — rotate with the hex
      ctx.save();
      ctx.translate(cx + shakeX, cy + shakeY);
      ctx.rotate(st.hexRotVisual);
      for (let f = 0; f < 6; f++) {
        ctx.save();
        ctx.rotate(f * ROT_STEP);
        const stack = st.stacks[f];
        const danger = stack.length >= MAX_STACK;
        for (let d = 0; d < stack.length; d++) {
          const hue = COLORS[stack[d]].hue;
          drawBlock(ctx, HEX_APOTHEM + d * BLOCK_H, hue, false, danger);
        }
        ctx.restore();
      }
      ctx.restore();

      // Inner hex — drawn AFTER stacks so corners read cleanly
      ctx.save();
      ctx.translate(cx + shakeX, cy + shakeY);
      ctx.rotate(st.hexRotVisual);
      const inner = ctx.createRadialGradient(
        0,
        0,
        0,
        0,
        0,
        HEX_APOTHEM * 1.1,
      );
      inner.addColorStop(0, "rgba(124,92,255,0.45)");
      inner.addColorStop(1, "rgba(40,20,80,0.7)");
      ctx.fillStyle = inner;
      drawHexPath(ctx, HEX_APOTHEM, 0);
      ctx.fill();
      ctx.strokeStyle = "rgba(200,180,255,0.9)";
      ctx.lineWidth = 2.5;
      ctx.shadowColor = "rgba(124,92,255,0.7)";
      ctx.shadowBlur = 14;
      drawHexPath(ctx, HEX_APOTHEM, 0);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();

      // Falling blocks — world-space (do NOT rotate with hex)
      ctx.save();
      ctx.translate(cx + shakeX, cy + shakeY);
      for (const f of st.falling) {
        ctx.save();
        ctx.rotate(f.lane * ROT_STEP);
        const hue = COLORS[f.color].hue;
        drawBlock(ctx, HEX_APOTHEM + Math.max(0, f.radial), hue, true, false);
        ctx.restore();
      }
      ctx.restore();

      // Particles
      for (const p of st.particles) {
        const a = Math.max(0, p.life / p.max);
        ctx.fillStyle = `hsla(${p.hue},90%,72%,${a})`;
        ctx.beginPath();
        ctx.arc(p.x + shakeX, p.y + shakeY, 2 + a * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }

      // Flash overlay on big clears
      if (st.flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${st.flash * 0.35})`;
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#0a0a18] to-[#0b0d12] p-2 sm:p-3">
      <div className="shrink-0 flex items-center justify-center gap-2 mb-2 text-white text-xs sm:text-sm flex-wrap">
        <Stat label="Score" value={score} accent />
        <Stat label="Level" value={level} />
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
            className="absolute inset-0 w-full h-full block rounded-xl border border-white/10"
          />
          {!started && !over && (
            <GameOverlay
              icon="⬢"
              title="Hextris"
              subtitle={
                <>
                  Coloured blocks slide in from six lanes. Spin the hex to
                  redirect them and line up <b>three of a kind</b> on a face —
                  or around a ring — to clear them.
                  <br />
                  <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono">
                    ←
                  </kbd>{" "}
                  /{" "}
                  <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono">
                    →
                  </kbd>{" "}
                  rotate · tap halves on mobile
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
                  <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono">
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
              title="Stack overflow"
              subtitle={`Score ${score} · Level ${level}`}
              primary={{ label: "Play again", onClick: start }}
            >
              <ScoreStatus gameSlug="hextris" status={submitStatus} />
            </GameOverlay>
          )}
        </div>
      </div>
      <div className="shrink-0 mt-2 text-[11px] text-white/60 text-center">
        <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono">←</kbd>/
        <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono">A</kbd>{" "}
        and{" "}
        <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono">→</kbd>/
        <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono">D</kbd>{" "}
        rotate · tap halves on mobile ·{" "}
        <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono">P</kbd>{" "}
        pauses
      </div>
    </div>
  );
}

/** Trace the path of a regular flat-top hexagon centred at origin
 *  with the given apothem (perpendicular face distance) and rotation. */
function drawHexPath(
  ctx: CanvasRenderingContext2D,
  apothem: number,
  rotation: number,
) {
  // For a regular hexagon, circumradius = apothem * 2/√3 = side length.
  const circumR = (apothem * 2) / Math.sqrt(3);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    // Vertices sit halfway between face normals (at i*60° + 30°).
    const a = rotation + i * Math.PI / 3 + Math.PI / 6;
    const vx = Math.cos(a) * circumR;
    const vy = Math.sin(a) * circumR;
    if (i === 0) ctx.moveTo(vx, vy);
    else ctx.lineTo(vx, vy);
  }
  ctx.closePath();
}

/** Draw one block at the given inner-radial offset along the +x
 *  axis. The caller is responsible for translating/rotating so +x
 *  points along the relevant face's outward normal. */
function drawBlock(
  ctx: CanvasRenderingContext2D,
  innerR: number,
  hue: number,
  falling: boolean,
  danger: boolean,
) {
  const m = 1.4; // small inset so blocks read as discrete tiles
  const x = innerR + m;
  const y = -BLOCK_W / 2 + m;
  const w = BLOCK_H - m * 2;
  const h = BLOCK_W - m * 2;
  // Body gradient — bright on the inside (centre-facing) edge,
  // darker on the outside, so depth reads.
  const grad = ctx.createLinearGradient(x, 0, x + w, 0);
  const baseL = falling ? 68 : 55;
  grad.addColorStop(0, `hsl(${hue},90%,${baseL + 8}%)`);
  grad.addColorStop(1, `hsl(${hue},90%,${baseL - 12}%)`);
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
  // Specular shimmer along the inner edge
  ctx.fillStyle = `hsla(${hue},100%,90%,0.45)`;
  ctx.fillRect(x, y, w * 0.18, h);
  // Falling blocks get a brighter outline so they read as in-flight
  if (falling) {
    ctx.strokeStyle = `hsla(${hue},100%,80%,0.75)`;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x, y, w, h);
  } else if (danger) {
    // Danger pulse on full stacks
    ctx.strokeStyle = "rgba(255,92,174,0.55)";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x, y, w, h);
  }
}

/** Find every block that should clear right now: 3+ same-colour
 *  consecutive on a single face's stack, OR 3+ same-colour
 *  consecutive across faces at the same depth (with wrap). Removes
 *  matched blocks from the stacks and returns the cleared cells so
 *  the caller can emit particles / cascade-multiply. */
function runMatches(
  state: State,
): { f: number; d: number; color: number }[] {
  const stacks = state.stacks;
  const marked: boolean[][] = stacks.map((s) => s.map(() => false));

  // 1) Per-face vertical runs
  for (let f = 0; f < 6; f++) {
    const stk = stacks[f];
    let i = 0;
    while (i < stk.length) {
      let j = i;
      while (j < stk.length && stk[j] === stk[i]) j++;
      if (j - i >= 3) for (let k = i; k < j; k++) marked[f][k] = true;
      i = j;
    }
  }

  // 2) Per-ring runs (same depth, consecutive faces with wrap)
  let maxDepth = 0;
  for (const s of stacks) if (s.length > maxDepth) maxDepth = s.length;
  for (let d = 0; d < maxDepth; d++) {
    const ring: number[] = [];
    for (let f = 0; f < 6; f++) {
      ring.push(d < stacks[f].length ? stacks[f][d] : -1);
    }
    // Walk a doubled ring so wrap-around matches are found exactly
    // once. Cap each run at 6 since the ring is only 6 long.
    const doubled = [...ring, ...ring];
    const ringMark = new Array<boolean>(6).fill(false);
    let i = 0;
    while (i < 12) {
      if (doubled[i] === -1) {
        i++;
        continue;
      }
      let j = i;
      while (j < i + 6 && doubled[j] === doubled[i]) j++;
      if (j - i >= 3) {
        for (let k = i; k < j; k++) ringMark[k % 6] = true;
      }
      i = j > i ? j : i + 1;
    }
    for (let f = 0; f < 6; f++) {
      if (ringMark[f]) marked[f][d] = true;
    }
  }

  const cleared: { f: number; d: number; color: number }[] = [];
  for (let f = 0; f < 6; f++) {
    for (let d = 0; d < stacks[f].length; d++) {
      if (marked[f][d]) cleared.push({ f, d, color: stacks[f][d] });
    }
  }
  if (cleared.length === 0) return cleared;
  for (let f = 0; f < 6; f++) {
    stacks[f] = stacks[f].filter((_, d) => !marked[f][d]);
  }
  return cleared;
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
