"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useKeyboard } from "../useGameLoop";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";

const W = 480;
const H = 700;

type Obstacle = { x: number; y: number; w: number; h: number; color: string };

export default function DriftKing() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keys = useKeyboard();
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState(false);
  const submitStatus = useSubmitScoreOnGameOver("drift-king", score, over);

  const stateRef = useRef({
    carX: W / 2,
    carY: H - 120,
    speed: 200,
    roadOffset: 0,
    obstacles: [] as Obstacle[],
    spawnAt: 0,
    elapsed: 0,
  });

  useEffect(() => {
    setBest(Number(localStorage.getItem("nexplay:drift-best") || 0));
  }, []);

  const reset = useCallback(() => {
    stateRef.current = {
      carX: W / 2,
      carY: H - 120,
      speed: 200,
      roadOffset: 0,
      obstacles: [],
      spawnAt: 0,
      elapsed: 0,
    };
    setScore(0);
    setOver(false);
  }, []);

  useEffect(() => {
    if (over) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      const k = keys.current;

      if (k.has("ArrowLeft") || k.has("a")) st.carX -= 280 * dt;
      if (k.has("ArrowRight") || k.has("d")) st.carX += 280 * dt;
      if (k.has("ArrowUp") || k.has("w")) st.speed = Math.min(540, st.speed + 80 * dt);
      else st.speed = Math.max(180, st.speed - 30 * dt);
      if (k.has("ArrowDown") || k.has("s")) st.speed = Math.max(120, st.speed - 200 * dt);

      st.carX = Math.max(80, Math.min(W - 80, st.carX));
      st.roadOffset = (st.roadOffset + st.speed * dt) % 80;
      st.elapsed += dt;
      st.spawnAt -= dt;

      if (st.spawnAt <= 0) {
        st.spawnAt = Math.max(0.4, 1.2 - st.elapsed * 0.01);
        const lane = 80 + Math.random() * (W - 200);
        st.obstacles.push({
          x: lane,
          y: -60,
          w: 50,
          h: 80,
          color: ["#dc2626", "#7c5cff", "#facc15", "#06b6d4"][Math.floor(Math.random() * 4)],
        });
      }

      for (const o of st.obstacles) o.y += st.speed * dt;
      st.obstacles = st.obstacles.filter((o) => o.y < H + 100);

      // collision
      for (const o of st.obstacles) {
        if (
          Math.abs(o.x - st.carX) < (o.w / 2 + 22) &&
          Math.abs(o.y - st.carY) < (o.h / 2 + 35)
        ) {
          setOver(true);
          setScore((s) => {
            setBest((b) => {
              const nb = Math.max(b, s);
              localStorage.setItem("nexplay:drift-best", String(nb));
              return nb;
            });
            return s;
          });
          return;
        }
      }
      setScore((s) => s + Math.floor(st.speed * dt * 0.1));

      // draw
      ctx.fillStyle = "#1f2937";
      ctx.fillRect(0, 0, W, H);
      // grass
      ctx.fillStyle = "#0d2b1a";
      ctx.fillRect(0, 0, 60, H);
      ctx.fillRect(W - 60, 0, 60, H);
      // road edge
      ctx.fillStyle = "white";
      ctx.fillRect(60, 0, 4, H);
      ctx.fillRect(W - 64, 0, 4, H);
      // lane markings
      ctx.fillStyle = "white";
      for (let y = -80 + st.roadOffset; y < H; y += 80) {
        ctx.fillRect(W / 2 - 3, y, 6, 40);
      }

      // obstacles
      for (const o of st.obstacles) {
        ctx.fillStyle = o.color;
        ctx.fillRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.fillRect(o.x - o.w / 2 + 6, o.y - o.h / 2 + 8, o.w - 12, 14);
      }

      // car
      ctx.save();
      ctx.translate(st.carX, st.carY);
      ctx.fillStyle = "#7c5cff";
      ctx.fillRect(-22, -35, 44, 70);
      ctx.fillStyle = "#1f2937";
      ctx.fillRect(-18, -28, 36, 18);
      ctx.fillRect(-18, 8, 36, 14);
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(-26, -30, 6, 16);
      ctx.fillRect(20, -30, 6, 16);
      ctx.fillRect(-26, 14, 6, 16);
      ctx.fillRect(20, 14, 6, 16);
      ctx.restore();

      // hud
      ctx.fillStyle = "white";
      ctx.font = "bold 20px system-ui";
      ctx.fillText(`Score: ${score}`, 12, 30);
      ctx.fillText(`Speed: ${Math.round(st.speed)}`, 12, 55);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [keys, over, score]);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#1a0808] to-[#0b0d12] p-4">
      <div className="text-white text-xs mb-2">
        Best: <b>{best}</b> • Arrow keys / WASD
      </div>
      <div className="relative" style={{ width: "min(70vw, 480px)", height: "min(85vh, 700px)" }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="rounded-xl border border-white/10 w-full h-full"
        />
        {over && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded-xl gap-2">
            <div className="text-4xl font-black text-white mb-1">💥 Crashed</div>
            <div className="text-white/80">Score: {score}</div>
            <ScoreStatus gameSlug="drift-king" status={submitStatus} />
            <button
              onClick={reset}
              className="mt-3 px-6 py-3 rounded-lg bg-white text-black font-bold hover:scale-105 transition-transform"
            >
              Race again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
