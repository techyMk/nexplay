"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useKeyboard } from "../useGameLoop";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";

const W = 800;
const H = 540;

type Asteroid = { x: number; y: number; vx: number; vy: number; r: number };
type Bullet = { x: number; y: number; vx: number; vy: number; life: number };

function spawnAsteroids(count: number): Asteroid[] {
  return Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      vx: Math.cos(angle) * (40 + Math.random() * 40),
      vy: Math.sin(angle) * (40 + Math.random() * 40),
      r: 30,
    };
  });
}

export default function Asteroids() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keys = useKeyboard();
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState(false);
  const submitStatus = useSubmitScoreOnGameOver("asteroids", score, over);

  const stateRef = useRef({
    px: W / 2, py: H / 2, pa: -Math.PI / 2, pvx: 0, pvy: 0,
    bullets: [] as Bullet[],
    asteroids: spawnAsteroids(5),
    fireCool: 0,
    invuln: 1.5,
  });

  useEffect(() => setBest(Number(localStorage.getItem("nexplay:asteroids-best") || 0)), []);

  const reset = useCallback(() => {
    stateRef.current = {
      px: W / 2, py: H / 2, pa: -Math.PI / 2, pvx: 0, pvy: 0,
      bullets: [], asteroids: spawnAsteroids(5), fireCool: 0, invuln: 1.5,
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

    const wrap = (v: number, max: number) => ((v % max) + max) % max;

    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      const k = keys.current;

      if (st.invuln > 0) st.invuln -= dt;

      if (k.has("ArrowLeft") || k.has("a")) st.pa -= 4 * dt;
      if (k.has("ArrowRight") || k.has("d")) st.pa += 4 * dt;
      if (k.has("ArrowUp") || k.has("w")) {
        st.pvx += Math.cos(st.pa) * 280 * dt;
        st.pvy += Math.sin(st.pa) * 280 * dt;
      }
      // friction
      st.pvx *= 0.99; st.pvy *= 0.99;
      st.px = wrap(st.px + st.pvx * dt, W);
      st.py = wrap(st.py + st.pvy * dt, H);

      st.fireCool -= dt;
      if (k.has(" ") && st.fireCool <= 0) {
        st.bullets.push({
          x: st.px, y: st.py,
          vx: Math.cos(st.pa) * 480 + st.pvx,
          vy: Math.sin(st.pa) * 480 + st.pvy,
          life: 1.2,
        });
        st.fireCool = 0.18;
      }

      for (const b of st.bullets) {
        b.x = wrap(b.x + b.vx * dt, W);
        b.y = wrap(b.y + b.vy * dt, H);
        b.life -= dt;
      }
      st.bullets = st.bullets.filter((b) => b.life > 0);

      for (const a of st.asteroids) {
        a.x = wrap(a.x + a.vx * dt, W);
        a.y = wrap(a.y + a.vy * dt, H);
      }

      // bullet vs asteroid
      const newAsts: Asteroid[] = [];
      const removeBullets: Set<Bullet> = new Set();
      for (const a of st.asteroids) {
        let hit = false;
        for (const b of st.bullets) {
          if (Math.hypot(a.x - b.x, a.y - b.y) < a.r) {
            hit = true;
            removeBullets.add(b);
            setScore((s) => s + (a.r > 20 ? 20 : 50));
            if (a.r > 18) {
              for (let i = 0; i < 2; i++) {
                const angle = Math.random() * Math.PI * 2;
                newAsts.push({
                  x: a.x, y: a.y,
                  vx: Math.cos(angle) * 80,
                  vy: Math.sin(angle) * 80,
                  r: a.r * 0.55,
                });
              }
            }
            break;
          }
        }
        if (!hit) newAsts.push(a);
      }
      st.asteroids = newAsts;
      st.bullets = st.bullets.filter((b) => !removeBullets.has(b));

      // ship vs asteroid
      if (st.invuln <= 0) {
        for (const a of st.asteroids) {
          if (Math.hypot(a.x - st.px, a.y - st.py) < a.r + 10) {
            setOver(true);
            setBest((b) => {
              const nb = Math.max(b, score);
              localStorage.setItem("nexplay:asteroids-best", String(nb));
              return nb;
            });
            return;
          }
        }
      }

      // spawn more if cleared
      if (st.asteroids.length === 0) st.asteroids = spawnAsteroids(6);

      // draw
      ctx.fillStyle = "#0a0218";
      ctx.fillRect(0, 0, W, H);
      // stars
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      for (let i = 0; i < 60; i++) {
        const x = (i * 137) % W, y = (i * 219) % H;
        ctx.fillRect(x, y, 1.5, 1.5);
      }
      // asteroids
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      for (const a of st.asteroids) {
        ctx.beginPath();
        for (let i = 0; i <= 8; i++) {
          const ang = (i / 8) * Math.PI * 2;
          const r = a.r + Math.sin(i * 4 + a.x) * 3;
          const x = a.x + Math.cos(ang) * r;
          const y = a.y + Math.sin(ang) * r;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // bullets
      ctx.fillStyle = "#facc15";
      for (const b of st.bullets) {
        ctx.beginPath(); ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2); ctx.fill();
      }
      // ship
      ctx.save();
      ctx.translate(st.px, st.py);
      ctx.rotate(st.pa);
      ctx.strokeStyle = st.invuln > 0 && Math.floor(st.invuln * 10) % 2 === 0 ? "rgba(255,255,255,0.4)" : "#7c5cff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-10, 8);
      ctx.lineTo(-6, 0);
      ctx.lineTo(-10, -8);
      ctx.closePath();
      ctx.stroke();
      if ((k.has("ArrowUp") || k.has("w")) && Math.random() < 0.7) {
        ctx.strokeStyle = "#ff5cae";
        ctx.beginPath();
        ctx.moveTo(-6, 4);
        ctx.lineTo(-14, 0);
        ctx.lineTo(-6, -4);
        ctx.stroke();
      }
      ctx.restore();
      // hud
      ctx.fillStyle = "white";
      ctx.font = "bold 20px system-ui";
      ctx.fillText(`Score: ${score}`, 14, 30);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [keys, over, score]);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#020118] to-[#0b0d12] p-4">
      <div className="text-white text-xs mb-2">Best: <b>{best}</b> • Arrows / WASD • Space to fire</div>
      <div className="relative w-full" style={{ maxWidth: 800, aspectRatio: `${W}/${H}`, maxHeight: "75vh" }}>
        <canvas ref={canvasRef} width={W} height={H} className="rounded-xl border border-white/10 w-full h-full" />
        {over && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded-xl gap-2">
            <div className="text-4xl font-black text-white">Game over</div>
            <div className="text-white/80">Score: {score}</div>
            <ScoreStatus gameSlug="asteroids" status={submitStatus} />
            <button onClick={reset} className="mt-2 px-6 py-3 rounded-lg bg-white text-black font-bold hover:scale-105 transition-transform">Play again</button>
          </div>
        )}
      </div>
    </div>
  );
}
