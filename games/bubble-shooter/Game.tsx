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

type Bubble = { x: number; y: number; color: number };
type Shot = { x: number; y: number; vx: number; vy: number; color: number };
type Falling = {
  x: number;
  y: number;
  vy: number;
  vx: number;
  color: number;
  alpha: number;
};
type Pop = { x: number; y: number; color: number; t: number };

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
    const colsThis = r % 2 === 0 ? COLS : COLS - 1;
    for (let c = 0; c < colsThis; c++) {
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

export default function BubbleShooter() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
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
      mouseX: W / 2,
      mouseY: H - 80,
    };
    setScore(0);
    setOver(false);
    setStarted(false);
    setPaused(false);
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
      let dy = Math.sin(angle);
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
          if (bestR >= 0) {
            const placed = { x: colX(bestC, bestR), y: rowY(bestR), color: st.shot.color };
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
              for (const [r, c] of cluster) {
                const cell = st.grid[r][c];
                if (cell) {
                  st.pops.push({ x: cell.x, y: cell.y, color: cell.color, t: 0 });
                }
                st.grid[r][c] = null;
              }
              setScore((s) => s + cluster.length * 10);
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
          st.shot = null;
          forceTick((n) => n + 1);
        }
      }

      // Animations only advance while live
      if (live) {
        const gravity = 1100;
        for (const f of st.falling) {
          f.vy += gravity * dt;
          f.y += f.vy * dt;
          f.x += f.vx * dt;
          if (f.y > H + 50) f.alpha = 0;
        }
        st.falling = st.falling.filter((f) => f.alpha > 0);
        for (const p of st.pops) p.t += dt;
        st.pops = st.pops.filter((p) => p.t < 0.32);
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

      // Aim guide line
      if (!st.shot) {
        const { points, targetColor } = computeAimLine(st.grid, st.aim);
        ctx.strokeStyle = targetColor != null
          ? COLORS[targetColor] + "AA"
          : "rgba(255,255,255,0.3)";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 8]);
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Grid bubbles
      for (let r = 0; r < st.grid.length; r++) {
        const row = st.grid[r];
        for (let c = 0; c < row.length; c++) {
          const b = row[c];
          if (!b) continue;
          drawBubble(ctx, b.x, b.y, RADIUS, b.color);
        }
      }

      // Falling bubbles
      for (const f of st.falling) {
        ctx.globalAlpha = Math.max(0, Math.min(1, f.alpha));
        drawBubble(ctx, f.x, f.y, RADIUS, f.color);
        ctx.globalAlpha = 1;
      }

      // Pop animations
      for (const p of st.pops) {
        const t = p.t / 0.32; // 0..1
        const r = RADIUS + t * RADIUS * 1.4;
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = COLORS[p.color];
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Shooter base + next bubble
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.arc(W / 2, SHOOTER_Y, RADIUS + 8, 0, Math.PI * 2);
      ctx.fill();
      drawBubble(ctx, W / 2, SHOOTER_Y, RADIUS, st.nextColor);

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

      // HUD
      ctx.fillStyle = "white";
      ctx.font = "bold 22px system-ui";
      ctx.fillText(`${score}`, 16, 32);

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
  }, [over, score, fire, swapNext]);

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#0a1828] to-[#0b0d12] p-2 sm:p-3">
      <div className="shrink-0 flex items-center justify-center gap-2 text-white text-[11px] sm:text-xs mb-2">
        <SoundToggle />
        <span className="opacity-80">
          Aim · Click or <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono">Space</kbd> to shoot · <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono">Q</kbd> swap · <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono">P</kbd> pause
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

function drawBubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  colorIndex: number,
) {
  const color = COLORS[colorIndex];
  const grad = ctx.createRadialGradient(
    x - radius * 0.35,
    y - radius * 0.35,
    radius * 0.1,
    x,
    y,
    radius,
  );
  grad.addColorStop(0, lighten(color, 0.35));
  grad.addColorStop(0.7, color);
  grad.addColorStop(1, darken(color, 0.25));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, radius - 1, 0, Math.PI * 2);
  ctx.fill();
  // Highlight
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.beginPath();
  ctx.arc(x - radius * 0.32, y - radius * 0.32, radius * 0.28, 0, Math.PI * 2);
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
