"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";

const W = 480;
const H = 640;
const RADIUS = 18;
const COLS = 12;
const ROW_OFFSET = (W - COLS * RADIUS * 2) / 2;
const COLORS = ["#ef4444", "#3b82f6", "#facc15", "#16a34a", "#7c5cff", "#ec4899"];

type Bubble = { x: number; y: number; color: number };
type Shot = { x: number; y: number; vx: number; vy: number; color: number };

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

export default function BubbleShooter() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const submitStatus = useSubmitScoreOnGameOver("bubble-shooter", score, over);

  const stateRef = useRef({
    grid: makeInitialBoard() as (Bubble | null)[][],
    aim: -Math.PI / 2,
    shot: null as Shot | null,
    nextColor: Math.floor(Math.random() * 5),
    mouseX: W / 2,
    mouseY: H - 80,
  });

  const reset = useCallback(() => {
    stateRef.current = {
      grid: makeInitialBoard(),
      aim: -Math.PI / 2,
      shot: null,
      nextColor: Math.floor(Math.random() * 5),
      mouseX: W / 2,
      mouseY: H - 80,
    };
    setScore(0);
    setOver(false);
  }, []);

  const fire = useCallback(() => {
    const st = stateRef.current;
    if (st.shot) return;
    const speed = 720;
    st.shot = {
      x: W / 2,
      y: H - 60,
      vx: Math.cos(st.aim) * speed,
      vy: Math.sin(st.aim) * speed,
      color: st.nextColor,
    };
    st.nextColor = Math.floor(Math.random() * 5);
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
      const dy = y - (H - 60);
      const ang = Math.atan2(dy, dx);
      stateRef.current.aim = Math.max(-Math.PI + 0.2, Math.min(-0.2, ang));
    };

    const onMove = (e: MouseEvent) => updateAim(e.clientX, e.clientY);
    const onClick = () => fire();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        fire();
      }
    };
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);

    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const st = stateRef.current;

      // shot
      if (st.shot) {
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
              for (const [r, c] of cluster) st.grid[r][c] = null;
              setScore((s) => s + cluster.length * 10);
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
              for (let r = 0; r < st.grid.length; r++) {
                for (let c = 0; c < (st.grid[r]?.length ?? 0); c++) {
                  if (st.grid[r][c] && !reachable.has(`${r},${c}`)) {
                    st.grid[r][c] = null;
                    setScore((s) => s + 5);
                  }
                }
              }
            }
            // game over check
            const lowest = st.grid.reduce((acc, row, r) => (row.some((b) => b) ? r : acc), -1);
            if (rowY(lowest) > H - 120) setOver(true);
            // win check
            const any = st.grid.some((row) => row.some((b) => b));
            if (!any) setOver(true); // technically win
          }
          st.shot = null;
        }
      }

      // draw
      ctx.fillStyle = "#0b0d12";
      ctx.fillRect(0, 0, W, H);
      // bubbles
      for (let r = 0; r < st.grid.length; r++) {
        const row = st.grid[r];
        for (let c = 0; c < row.length; c++) {
          const b = row[c];
          if (!b) continue;
          ctx.fillStyle = COLORS[b.color];
          ctx.beginPath();
          ctx.arc(b.x, b.y, RADIUS - 1, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.35)";
          ctx.beginPath();
          ctx.arc(b.x - 5, b.y - 5, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // shooter line
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(W / 2, H - 60);
      ctx.lineTo(W / 2 + Math.cos(st.aim) * 200, H - 60 + Math.sin(st.aim) * 200);
      ctx.stroke();
      ctx.setLineDash([]);
      // shooter
      ctx.fillStyle = COLORS[st.nextColor];
      ctx.beginPath();
      ctx.arc(W / 2, H - 60, RADIUS, 0, Math.PI * 2);
      ctx.fill();
      // shot
      if (st.shot) {
        ctx.fillStyle = COLORS[st.shot.color];
        ctx.beginPath();
        ctx.arc(st.shot.x, st.shot.y, RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }
      // hud
      ctx.fillStyle = "white";
      ctx.font = "bold 22px system-ui";
      ctx.fillText(`${score}`, 16, 32);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [over, score, fire]);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#0a1828] to-[#0b0d12] p-4">
      <div className="text-white text-xs mb-2">Aim with mouse · Click or Space to shoot</div>
      <div className="relative" style={{ width: "min(80vh, 480px)", aspectRatio: `${W}/${H}` }}>
        <canvas ref={canvasRef} width={W} height={H} className="rounded-xl border border-white/10 cursor-crosshair w-full h-full" />
        {over && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-xl gap-2">
            <div className="text-4xl font-black text-white">Round over</div>
            <div className="text-white/80">Score: {score}</div>
            <ScoreStatus gameSlug="bubble-shooter" status={submitStatus} />
            <button onClick={reset} className="mt-2 px-6 py-3 rounded-lg bg-white text-black font-bold hover:scale-105 transition-transform">Play again</button>
          </div>
        )}
      </div>
    </div>
  );
}
