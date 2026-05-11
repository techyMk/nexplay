"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";
import { GameOverlay, PauseToggle } from "@/components/games/GameOverlay";
import { SoundToggle } from "@/components/SoundToggle";
import { Sfx } from "@/lib/sound";

const W = 480;
const H = 640;
const RADIUS = 18;
const COLS = 12;
const ROW_OFFSET = (W - COLS * RADIUS * 2) / 2;
const COLORS = ["#ef4444", "#3b82f6", "#facc15", "#16a34a", "#7c5cff", "#ec4899"];
const SHOOTER_Y = H - 60;
/** Vertical distance between adjacent rows in the hex grid. */
const ROW_HEIGHT = RADIUS * 1.85;
/** A new row is forced down from the top after this many shots that
 *  failed to clear a cluster — clearing resets the counter. Lower =
 *  more pressure. 6 felt fair in playtesting: a steady-state player
 *  who clears every 2-3 shots holds ground; a player who misses is
 *  pushed toward the bottom. */
const SHOTS_PER_DROP = 6;
/** Wall-drop animation length (seconds). Shooting is disabled while
 *  the descent plays out. */
const WALL_DROP_DUR = 0.35;

type Bubble = {
  x: number;
  y: number;
  color: number;
  /** Game-time stamp at which this bubble landed in the grid. Used by
   *  drawBubble to apply a brief overshoot-and-settle scale on snap. */
  placedAt?: number;
  /** Wall-drop animation source coordinates — when set, the bubble
   *  renders at lerp(from, to, k) for the duration of the drop. */
  animFromX?: number;
  animFromY?: number;
  animToX?: number;
  animToY?: number;
};
type Shot = { x: number; y: number; vx: number; vy: number; color: number };
type Falling = {
  x: number;
  y: number;
  vy: number;
  vx: number;
  color: number;
  alpha: number;
};
/** Pop ring for a cleared bubble. `delay` staggers the start so a
 *  cluster radiates outward from the impact point instead of
 *  detonating uniformly. `t` accrues real game time. */
type Pop = { x: number; y: number; color: number; t: number; delay: number };
/** Tiny coloured shard that flies off when a bubble pops. Gravity
 *  pulls it down; alpha is derived from `life`. */
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
};
/** Floating "+N" badge at the cluster centre. */
type ScorePopup = { x: number; y: number; text: string; t: number };

function rowY(row: number) {
  return RADIUS + row * (RADIUS * 1.85);
}

function colX(col: number, row: number) {
  return ROW_OFFSET + RADIUS + col * RADIUS * 2 + (row % 2 === 1 ? RADIUS : 0);
}

function makeInitialBoard(rows = 6): (Bubble | null)[][] {
  const grid: (Bubble | null)[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: (Bubble | null)[] = [];
    // Uniform 12 columns per row — odd rows still hex-offset via colX,
    // but using the same column count means wall drops can shift the
    // whole grid down without losing edge bubbles.
    for (let c = 0; c < COLS; c++) {
      row.push({
        x: colX(c, r),
        y: rowY(r),
        color: Math.floor(Math.random() * Math.min(5, COLORS.length)),
      });
    }
    grid.push(row);
  }
  return grid;
}

/** Build a fresh top row for a wall drop. Mostly draws from active
 *  colours so the new row participates in possible matches; if the
 *  board is empty (just won), fall back to any of the first five. */
function makeDropRow(grid: (Bubble | null)[][]): (Bubble | null)[] {
  const colours = activeColors(grid);
  const pool = colours.length > 0 ? colours : [0, 1, 2, 3, 4];
  const row: (Bubble | null)[] = [];
  for (let c = 0; c < COLS; c++) {
    row.push({
      x: colX(c, 0),
      y: rowY(0),
      color: pool[Math.floor(Math.random() * pool.length)],
    });
  }
  return row;
}

function neighbors(r: number, c: number): [number, number][] {
  const odd = r % 2 === 1;
  return odd
    ? [[r, c - 1], [r, c + 1], [r - 1, c], [r - 1, c + 1], [r + 1, c], [r + 1, c + 1]]
    : [[r, c - 1], [r, c + 1], [r - 1, c - 1], [r - 1, c], [r + 1, c - 1], [r + 1, c]];
}

function activeColors(grid: (Bubble | null)[][]): number[] {
  const set = new Set<number>();
  for (const row of grid) for (const b of row) if (b) set.add(b.color);
  return [...set];
}

function pickShotColor(grid: (Bubble | null)[][]): number {
  const active = activeColors(grid);
  if (active.length === 0) return Math.floor(Math.random() * 5);
  return active[Math.floor(Math.random() * active.length)];
}

/** Push the wall down by one row: insert a fresh row at the top and
 *  set up animation source/target coords on every bubble so the loop
 *  can lerp them into their new positions over WALL_DROP_DUR. */
function triggerWallDrop(st: {
  grid: (Bubble | null)[][];
  wallDrop: { active: boolean; t: number };
}) {
  // Capture each bubble's current coords as the animation start...
  for (const row of st.grid) {
    for (const b of row) {
      if (!b) continue;
      b.animFromX = b.x;
      b.animFromY = b.y;
    }
  }
  // ...insert a new row at the top.
  const newRow = makeDropRow(st.grid);
  // The new row's bubbles START above the visible area so they slide
  // in from off-screen, then come to rest at row 0.
  for (const b of newRow) {
    if (!b) continue;
    b.animFromX = b.x;
    b.animFromY = b.y - ROW_HEIGHT;
  }
  st.grid.unshift(newRow);

  // Now compute target coords for every bubble from its new (r, c).
  // Existing rows have shifted index by 1, which means hex parity
  // flipped — capture that in the new x.
  for (let r = 0; r < st.grid.length; r++) {
    for (let c = 0; c < st.grid[r].length; c++) {
      const b = st.grid[r][c];
      if (!b) continue;
      b.animToX = colX(c, r);
      b.animToY = rowY(r);
    }
  }

  st.wallDrop.active = true;
  st.wallDrop.t = 0;
  Sfx.thud();
}

export default function BubbleShooter() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [shotsUntilDrop, setShotsUntilDrop] = useState(SHOTS_PER_DROP);
  const [, forceTick] = useState(0); // re-render the next/swap pills
  const submitStatus = useSubmitScoreOnGameOver("bubble-shooter", score, over);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const startedRef = useRef(false);
  startedRef.current = started;

  const stateRef = useRef({
    grid: makeInitialBoard() as (Bubble | null)[][],
    aim: -Math.PI / 2,
    shot: null as Shot | null,
    nextColor: Math.floor(Math.random() * 5),
    holdColor: Math.floor(Math.random() * 5),
    falling: [] as Falling[],
    pops: [] as Pop[],
    particles: [] as Particle[],
    scorePopups: [] as ScorePopup[],
    /** Running game-time accumulator. Used as the timestamp for
     *  bubble.placedAt and as the seed for marching-ants aim line. */
    gameTime: 0,
    /** Wall-drop state. While `active`, all bubbles render at lerp
     *  between their animFrom/animTo coords; `t` accrues time and
     *  the drop commits + clears at WALL_DROP_DUR. */
    wallDrop: { active: false, t: 0 } as { active: boolean; t: number },
    /** Mirror of the React state — read inside fire() to gate firing
     *  during a drop animation without a re-render dependency. */
    shotsUntilDrop: SHOTS_PER_DROP,
    mouseX: W / 2,
    mouseY: H - 80,
  });

  const reset = useCallback(() => {
    const g = makeInitialBoard();
    stateRef.current = {
      grid: g,
      aim: -Math.PI / 2,
      shot: null,
      nextColor: pickShotColor(g),
      holdColor: pickShotColor(g),
      falling: [],
      pops: [],
      particles: [],
      scorePopups: [],
      gameTime: 0,
      wallDrop: { active: false, t: 0 },
      shotsUntilDrop: SHOTS_PER_DROP,
      mouseX: W / 2,
      mouseY: H - 80,
    };
    setScore(0);
    setOver(false);
    setStarted(false);
    setPaused(false);
    setShotsUntilDrop(SHOTS_PER_DROP);
    forceTick((n) => n + 1);
  }, []);

  const start = useCallback(() => {
    setStarted(true);
    setPaused(false);
    forceTick((n) => n + 1);
  }, []);

  const togglePause = useCallback(() => {
    if (!startedRef.current) return;
    setPaused((p) => !p);
  }, []);

  const fire = useCallback(() => {
    if (!startedRef.current || pausedRef.current) return;
    const st = stateRef.current;
    if (st.shot) return;
    if (st.wallDrop.active) return; // wait for the wall to settle
    const speed = 720;
    st.shot = {
      x: W / 2,
      y: SHOOTER_Y,
      vx: Math.cos(st.aim) * speed,
      vy: Math.sin(st.aim) * speed,
      color: st.nextColor,
    };
    st.nextColor = st.holdColor;
    st.holdColor = pickShotColor(st.grid);
    forceTick((n) => n + 1);
    Sfx.shoot();
  }, []);

  const swapNext = useCallback(() => {
    const st = stateRef.current;
    if (st.shot) return;
    [st.nextColor, st.holdColor] = [st.holdColor, st.nextColor];
    forceTick((n) => n + 1);
  }, []);

  useEffect(() => {
    if (over) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const canvas = canvasRef.current!;
    let raf = 0;
    let last = performance.now();

    const updateAim = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * W;
      const y = ((clientY - rect.top) / rect.height) * H;
      const dx = x - W / 2;
      const dy = y - SHOOTER_Y;
      const ang = Math.atan2(dy, dx);
      stateRef.current.aim = Math.max(-Math.PI + 0.2, Math.min(-0.2, ang));
    };

    const onMove = (e: MouseEvent) => updateAim(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) updateAim(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onClick = () => fire();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        fire();
      } else if (e.key === "q" || e.key === "Q" || e.key === "Tab") {
        e.preventDefault();
        swapNext();
      } else if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        e.preventDefault();
        togglePause();
      }
    };
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("touchmove", onTouchMove, { passive: true });
    canvas.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);

    // Pre-compute aim line by raycasting against grid + walls
    const computeAimLine = (
      grid: (Bubble | null)[][],
      angle: number,
    ): { points: [number, number][]; targetColor?: number } => {
      const points: [number, number][] = [[W / 2, SHOOTER_Y]];
      let x = W / 2;
      let y = SHOOTER_Y;
      let dx = Math.cos(angle);
      const dy = Math.sin(angle);
      let bounces = 0;
      const step = 4;
      let targetColor: number | undefined;
      for (let i = 0; i < 400; i++) {
        x += dx * step;
        y += dy * step;
        if (x < RADIUS) {
          x = RADIUS;
          dx = -dx;
          if (++bounces > 3) break;
          points.push([x, y]);
        } else if (x > W - RADIUS) {
          x = W - RADIUS;
          dx = -dx;
          if (++bounces > 3) break;
          points.push([x, y]);
        }
        if (y < RADIUS) break;
        // collide with bubbles
        let hit = false;
        for (const row of grid) {
          for (const b of row) {
            if (!b) continue;
            if (Math.hypot(b.x - x, b.y - y) < RADIUS * 1.85) {
              targetColor = b.color;
              hit = true;
              break;
            }
          }
          if (hit) break;
        }
        if (hit) break;
      }
      points.push([x, y]);
      return { points, targetColor };
    };

    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      const live = startedRef.current && !pausedRef.current;

      // shot — only advances when live
      if (live && st.shot) {
        st.shot.x += st.shot.vx * dt;
        st.shot.y += st.shot.vy * dt;
        if (st.shot.x < RADIUS || st.shot.x > W - RADIUS) st.shot.vx *= -1;
        let collided = false;
        if (st.shot.y < RADIUS) collided = true;
        for (let r = 0; r < st.grid.length && !collided; r++) {
          const row = st.grid[r];
          for (let c = 0; c < row.length; c++) {
            const b = row[c];
            if (!b) continue;
            if (Math.hypot(b.x - st.shot.x, b.y - st.shot.y) < RADIUS * 1.85) {
              collided = true;
              break;
            }
          }
        }
        if (collided) {
          // snap to nearest empty cell
          let bestR = -1, bestC = -1, bestD = Infinity;
          for (let r = 0; r < 16; r++) {
            const colsThis = r % 2 === 0 ? COLS : COLS - 1;
            if (!st.grid[r]) st.grid[r] = Array(colsThis).fill(null);
            const row = st.grid[r];
            for (let c = 0; c < colsThis; c++) {
              if (row[c]) continue;
              const x = colX(c, r), y = rowY(r);
              const d = Math.hypot(x - st.shot.x, y - st.shot.y);
              if (d < bestD) { bestD = d; bestR = r; bestC = c; }
            }
          }
          let clusterCleared = false;
          if (bestR >= 0) {
            const placed: Bubble = {
              x: colX(bestC, bestR),
              y: rowY(bestR),
              color: st.shot.color,
              placedAt: st.gameTime,
            };
            st.grid[bestR][bestC] = placed;
            // flood fill same-color
            const cluster: [number, number][] = [];
            const stack: [number, number][] = [[bestR, bestC]];
            const seen = new Set<string>();
            while (stack.length) {
              const [r, c] = stack.pop()!;
              const key = `${r},${c}`;
              if (seen.has(key)) continue;
              seen.add(key);
              const cell = st.grid[r]?.[c];
              if (!cell || cell.color !== placed.color) continue;
              cluster.push([r, c]);
              for (const [nr, nc] of neighbors(r, c)) stack.push([nr, nc]);
            }
            if (cluster.length >= 3) {
              clusterCleared = true;
              const impactX = placed.x;
              const impactY = placed.y;
              for (const [r, c] of cluster) {
                const cell = st.grid[r][c];
                if (cell) {
                  // Stagger pop start time so the cluster radiates out
                  // from the impact point — feels more dynamic than a
                  // simultaneous detonation.
                  const dist = Math.hypot(cell.x - impactX, cell.y - impactY);
                  const delay = Math.min(0.18, dist / 600);
                  st.pops.push({
                    x: cell.x,
                    y: cell.y,
                    color: cell.color,
                    t: 0,
                    delay,
                  });
                  // Particle spray — 6 small shards per popped bubble.
                  for (let i = 0; i < 6; i++) {
                    const ang = Math.random() * Math.PI * 2;
                    const sp = 80 + Math.random() * 110;
                    st.particles.push({
                      x: cell.x,
                      y: cell.y,
                      vx: Math.cos(ang) * sp,
                      vy: Math.sin(ang) * sp - 40,
                      life: 0.55 + Math.random() * 0.25,
                      maxLife: 0.8,
                      color: COLORS[cell.color],
                    });
                  }
                }
                st.grid[r][c] = null;
              }
              const earned = cluster.length * 10;
              setScore((s) => s + earned);
              // Floating "+N" at the cluster centre.
              st.scorePopups.push({
                x: impactX,
                y: impactY - 6,
                text: `+${earned}`,
                t: 0,
              });
              Sfx.match();
              // drop floaters: anything not connected to row 0
              const reachable = new Set<string>();
              const q: [number, number][] = [];
              if (st.grid[0]) {
                for (let c = 0; c < st.grid[0].length; c++) {
                  if (st.grid[0][c]) {
                    q.push([0, c]);
                    reachable.add(`0,${c}`);
                  }
                }
              }
              while (q.length) {
                const [r, c] = q.shift()!;
                for (const [nr, nc] of neighbors(r, c)) {
                  const k = `${nr},${nc}`;
                  if (reachable.has(k)) continue;
                  if (st.grid[nr]?.[nc]) {
                    reachable.add(k);
                    q.push([nr, nc]);
                  }
                }
              }
              let droppedCount = 0;
              for (let r = 0; r < st.grid.length; r++) {
                for (let c = 0; c < (st.grid[r]?.length ?? 0); c++) {
                  const cell = st.grid[r][c];
                  if (cell && !reachable.has(`${r},${c}`)) {
                    // Convert to a falling bubble
                    st.falling.push({
                      x: cell.x,
                      y: cell.y,
                      vy: 30 + Math.random() * 40,
                      vx: (Math.random() - 0.5) * 60,
                      color: cell.color,
                      alpha: 1,
                    });
                    st.grid[r][c] = null;
                    droppedCount++;
                  }
                }
              }
              if (droppedCount > 0) setScore((s) => s + droppedCount * 5);
            }
            // game over check
            const lowest = st.grid.reduce((acc, row, r) => (row.some((b) => b) ? r : acc), -1);
            if (rowY(lowest) > H - 120) { setOver(true); Sfx.gameOver(); }
            // win check
            const any = st.grid.some((row) => row.some((b) => b));
            if (!any) { setOver(true); Sfx.win(); }
          }
          // Wall-drop pressure: clearing a cluster resets the
          // counter; missing decrements it. When it hits zero a new
          // row pushes in from the top — but only if the round
          // hasn't already ended (no point dropping after a win/loss).
          // The grid emptiness check above will already have set
          // `over=true` for the win path; the lowest-row check for the
          // loss. Reading st.grid as the source of truth here keeps
          // us decoupled from the React state's update timing.
          const stillPlaying = st.grid.some((row) => row.some((b) => b));
          const wallTooLow =
            (st.grid.reduce(
              (acc, row, r) => (row.some((b) => b) ? r : acc),
              -1,
            ) ?? -1) >= 0 &&
            rowY(
              st.grid.reduce(
                (acc, row, r) => (row.some((b) => b) ? r : acc),
                -1,
              ),
            ) > H - 120;
          if (stillPlaying && !wallTooLow) {
            if (clusterCleared) {
              st.shotsUntilDrop = SHOTS_PER_DROP;
            } else {
              st.shotsUntilDrop -= 1;
              if (st.shotsUntilDrop <= 0) {
                triggerWallDrop(st);
                st.shotsUntilDrop = SHOTS_PER_DROP;
              }
            }
            setShotsUntilDrop(st.shotsUntilDrop);
          }
          st.shot = null;
          forceTick((n) => n + 1);
        }
      }

      // Animations only advance while live
      if (live) {
        st.gameTime += dt;
        // Wall-drop animation: lerp every bubble's (x, y) from its
        // animFrom* to animTo*, then commit and check whether the
        // descent has pushed bubbles past the danger line.
        if (st.wallDrop.active) {
          st.wallDrop.t += dt;
          const k = Math.min(1, st.wallDrop.t / WALL_DROP_DUR);
          for (const row of st.grid) {
            for (const b of row) {
              if (!b || b.animFromX == null || b.animToX == null) continue;
              b.x = b.animFromX + (b.animToX - b.animFromX) * k;
              b.y = b.animFromY! + (b.animToY! - b.animFromY!) * k;
            }
          }
          if (k >= 1) {
            // Commit: snap to target coords and clear the anim fields.
            for (const row of st.grid) {
              for (const b of row) {
                if (!b) continue;
                if (b.animToX != null) b.x = b.animToX;
                if (b.animToY != null) b.y = b.animToY;
                delete b.animFromX;
                delete b.animFromY;
                delete b.animToX;
                delete b.animToY;
              }
            }
            st.wallDrop.active = false;
            // Game-over check after the drop settles — if the wall
            // has descended past the danger line, the round ends.
            const lowest = st.grid.reduce(
              (acc, row, r) => (row.some((b) => b) ? r : acc),
              -1,
            );
            if (lowest >= 0 && rowY(lowest) > H - 120) {
              setOver(true);
              Sfx.gameOver();
            }
          }
        }
        const gravity = 1100;
        for (const f of st.falling) {
          f.vy += gravity * dt;
          f.y += f.vy * dt;
          f.x += f.vx * dt;
          if (f.y > H + 50) f.alpha = 0;
        }
        st.falling = st.falling.filter((f) => f.alpha > 0);
        for (const p of st.pops) p.t += dt;
        // Pops live `delay + 0.32s`, then expire.
        st.pops = st.pops.filter((p) => p.t - p.delay < 0.32);
        // Particles: drift with gravity, fade with life.
        const partG = 360;
        for (const p of st.particles) {
          p.vy += partG * dt;
          p.vx *= 0.98;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.life -= dt;
        }
        st.particles = st.particles.filter((p) => p.life > 0);
        // Score popups: float up + fade across ~0.85s.
        for (const sp of st.scorePopups) sp.t += dt;
        st.scorePopups = st.scorePopups.filter((sp) => sp.t < 0.85);
      }

      // ---- draw ----
      // Background gradient
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#0a1530");
      grad.addColorStop(1, "#0b0d12");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Ceiling marker
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(0, 0, W, 2);

      // Danger line — bubbles below this point lose the round.
      // Pulses gently so the player notices what's at stake. Goes
      // bright red when the wall is about to drop on the next miss.
      const dangerY = H - 120;
      const urgency = Math.max(0, 1 - st.shotsUntilDrop / SHOTS_PER_DROP);
      const pulse = 0.5 + 0.5 * Math.sin(st.gameTime * 4);
      const dangerAlpha = 0.22 + urgency * 0.55 * pulse;
      ctx.strokeStyle = `rgba(239, 68, 68, ${dangerAlpha.toFixed(3)})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(0, dangerY);
      ctx.lineTo(W, dangerY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Aim guide line — marching-ants effect by sliding the dash
      // offset over time, so the trajectory reads as flowing toward
      // the target instead of static.
      if (!st.shot) {
        const { points, targetColor } = computeAimLine(st.grid, st.aim);
        ctx.strokeStyle = targetColor != null
          ? COLORS[targetColor] + "AA"
          : "rgba(255,255,255,0.3)";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 8]);
        ctx.lineDashOffset = -st.gameTime * 60;
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
      }

      // Grid bubbles — pass age (since placement) so newly snapped
      // bubbles can do a quick overshoot-and-settle.
      for (let r = 0; r < st.grid.length; r++) {
        const row = st.grid[r];
        for (let c = 0; c < row.length; c++) {
          const b = row[c];
          if (!b) continue;
          const age = b.placedAt != null ? st.gameTime - b.placedAt : Infinity;
          drawBubble(ctx, b.x, b.y, RADIUS, b.color, age);
        }
      }

      // Falling bubbles
      for (const f of st.falling) {
        ctx.globalAlpha = Math.max(0, Math.min(1, f.alpha));
        drawBubble(ctx, f.x, f.y, RADIUS, f.color);
        ctx.globalAlpha = 1;
      }

      // Pop animations — use (t - delay) so each cluster member
      // detonates a touch later than the one nearer the impact.
      for (const p of st.pops) {
        const localT = p.t - p.delay;
        if (localT < 0) continue;
        const t = Math.min(1, localT / 0.32);
        const r = RADIUS + t * RADIUS * 1.4;
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = COLORS[p.color];
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Particle shards — drawn over pops so they read as "burst out".
      for (const p of st.particles) {
        const a = Math.max(0, Math.min(1, p.life / p.maxLife));
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Floating +N score badges, drift up and fade.
      for (const sp of st.scorePopups) {
        const k = sp.t / 0.85;
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = "white";
        ctx.font = "bold 22px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(sp.text, sp.x, sp.y - k * 50);
        ctx.textAlign = "start";
      }
      ctx.globalAlpha = 1;

      // Shooter base + next bubble
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.arc(W / 2, SHOOTER_Y, RADIUS + 8, 0, Math.PI * 2);
      ctx.fill();
      drawBubble(ctx, W / 2, SHOOTER_Y, RADIUS, st.nextColor);

      // Aim arrow — small triangle ahead of the shooter that rotates
      // with the aim vector. Reads as the barrel of the cannon.
      ctx.save();
      ctx.translate(W / 2, SHOOTER_Y);
      ctx.rotate(st.aim);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.moveTo(RADIUS + 18, 0);
      ctx.lineTo(RADIUS + 6, -7);
      ctx.lineTo(RADIUS + 6, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Next-up indicator (smaller, off to the right)
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.beginPath();
      ctx.arc(W - 36, SHOOTER_Y, RADIUS - 2, 0, Math.PI * 2);
      ctx.fill();
      drawBubble(ctx, W - 36, SHOOTER_Y, RADIUS - 6, st.holdColor);
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "bold 10px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("NEXT", W - 36, SHOOTER_Y - RADIUS - 4);
      ctx.textAlign = "start";

      // Active shot
      if (st.shot) {
        drawBubble(ctx, st.shot.x, st.shot.y, RADIUS, st.shot.color);
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [over, fire, swapNext, togglePause]);

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#0a1828] to-[#0b0d12] p-2 sm:p-3">
      <div className="shrink-0 flex items-center justify-center gap-2 text-white text-[11px] sm:text-xs mb-2 flex-wrap">
        <SoundToggle />
        <span className="px-2 py-0.5 rounded-md bg-white/10 inline-flex items-center gap-1.5">
          <span className="opacity-60">SCORE</span>
          <b>{score}</b>
        </span>
        <span
          className={`px-2 py-0.5 rounded-md inline-flex items-center gap-1.5 transition-colors ${
            shotsUntilDrop <= 1
              ? "bg-rose-500/30 border border-rose-400/60 text-rose-100"
              : shotsUntilDrop <= 3
                ? "bg-amber-500/20 border border-amber-400/50 text-amber-100"
                : "bg-white/10"
          }`}
          title="Shots until the wall drops"
        >
          <span className="opacity-60">DROP IN</span>
          <b>{shotsUntilDrop}</b>
        </span>
        <span className="opacity-80 hidden sm:inline">
          <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono">Space</kbd> shoot ·{" "}
          <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono">Q</kbd> swap ·{" "}
          <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono">P</kbd> pause
        </span>
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
            className="absolute inset-0 w-full h-full block rounded-xl border border-white/10 cursor-crosshair"
          />
          {!started && !over && (
            <GameOverlay
              icon="🎯"
              title="Bubble Shooter"
              subtitle="Match three or more bubbles of the same color to clear them."
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
                  <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono">P</kbd>{" "}
                  to resume
                </>
              }
              primary={{ label: "▶ Resume", onClick: () => setPaused(false) }}
            />
          )}
          {over && (
            <GameOverlay
              icon="🛑"
              title="Round over"
              subtitle={`Score: ${score}`}
              primary={{ label: "Play again", onClick: reset }}
            >
              <ScoreStatus gameSlug="bubble-shooter" status={submitStatus} />
            </GameOverlay>
          )}
        </div>
      </div>
    </div>
  );
}

/** Brief overshoot-and-settle scale curve for newly placed bubbles.
 *  Peaks at ~1.18x at t=0.1s, then settles to 1.0x by t=0.22s. After
 *  that, it stays at exactly 1.0 — older bubbles render unchanged. */
function snapScale(age: number): number {
  if (age < 0.1) return 1 + (age / 0.1) * 0.18;
  if (age < 0.22) return 1.18 - ((age - 0.1) / 0.12) * 0.18;
  return 1;
}

function drawBubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  colorIndex: number,
  age?: number,
) {
  const r =
    age != null && age >= 0 && age < 0.22 ? radius * snapScale(age) : radius;
  const color = COLORS[colorIndex];
  const grad = ctx.createRadialGradient(
    x - r * 0.35,
    y - r * 0.35,
    r * 0.1,
    x,
    y,
    r,
  );
  grad.addColorStop(0, lighten(color, 0.35));
  grad.addColorStop(0.7, color);
  grad.addColorStop(1, darken(color, 0.25));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r - 1, 0, Math.PI * 2);
  ctx.fill();
  // Highlight
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.beginPath();
  ctx.arc(x - r * 0.32, y - r * 0.32, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
}

function lighten(hex: string, amount: number): string {
  return mixHex(hex, "#ffffff", amount);
}
function darken(hex: string, amount: number): string {
  return mixHex(hex, "#000000", amount);
}
function mixHex(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16);
  const ag = parseInt(a.slice(3, 5), 16);
  const ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16);
  const bg = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
}
