"use client";

import { useEffect, useRef, useState } from "react";
import { useKeyboard } from "../useGameLoop";

const W = 800;
const H = 480;
const PAD_W = 12;
const PAD_H = 80;
const BALL = 10;

export default function Pong() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keys = useKeyboard();
  const [score, setScore] = useState({ left: 0, right: 0 });
  const [running, setRunning] = useState(true);

  const stateRef = useRef({
    leftY: H / 2 - PAD_H / 2,
    rightY: H / 2 - PAD_H / 2,
    bx: W / 2,
    by: H / 2,
    bvx: 320,
    bvy: 180,
  });

  const reset = () => {
    setScore({ left: 0, right: 0 });
    stateRef.current = {
      leftY: H / 2 - PAD_H / 2,
      rightY: H / 2 - PAD_H / 2,
      bx: W / 2,
      by: H / 2,
      bvx: Math.random() < 0.5 ? -320 : 320,
      bvy: (Math.random() - 0.5) * 240,
    };
    setRunning(true);
  };

  useEffect(() => {
    if (!running) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      const k = keys.current;
      const speed = 360;

      if (k.has("w")) st.leftY -= speed * dt;
      if (k.has("s")) st.leftY += speed * dt;
      if (k.has("ArrowUp")) st.rightY -= speed * dt;
      if (k.has("ArrowDown")) st.rightY += speed * dt;
      st.leftY = Math.max(0, Math.min(H - PAD_H, st.leftY));
      st.rightY = Math.max(0, Math.min(H - PAD_H, st.rightY));

      st.bx += st.bvx * dt;
      st.by += st.bvy * dt;
      if (st.by < BALL / 2) { st.by = BALL / 2; st.bvy *= -1; }
      if (st.by > H - BALL / 2) { st.by = H - BALL / 2; st.bvy *= -1; }

      // left paddle
      if (
        st.bx - BALL / 2 < 20 + PAD_W &&
        st.bx - BALL / 2 > 20 &&
        st.by > st.leftY && st.by < st.leftY + PAD_H && st.bvx < 0
      ) {
        st.bvx *= -1.06;
        st.bvy += ((st.by - (st.leftY + PAD_H / 2)) / (PAD_H / 2)) * 200;
        st.bx = 20 + PAD_W + BALL / 2;
      }
      // right paddle
      if (
        st.bx + BALL / 2 > W - 20 - PAD_W &&
        st.bx + BALL / 2 < W - 20 &&
        st.by > st.rightY && st.by < st.rightY + PAD_H && st.bvx > 0
      ) {
        st.bvx *= -1.06;
        st.bvy += ((st.by - (st.rightY + PAD_H / 2)) / (PAD_H / 2)) * 200;
        st.bx = W - 20 - PAD_W - BALL / 2;
      }
      // scoring
      if (st.bx < -20) {
        setScore((s) => ({ ...s, right: s.right + 1 }));
        st.bx = W / 2; st.by = H / 2;
        st.bvx = 320; st.bvy = (Math.random() - 0.5) * 240;
      }
      if (st.bx > W + 20) {
        setScore((s) => ({ ...s, left: s.left + 1 }));
        st.bx = W / 2; st.by = H / 2;
        st.bvx = -320; st.bvy = (Math.random() - 0.5) * 240;
      }

      // draw
      ctx.fillStyle = "#0b0d12";
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.setLineDash([8, 12]);
      ctx.beginPath();
      ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "#7c5cff";
      ctx.fillRect(20, st.leftY, PAD_W, PAD_H);
      ctx.fillStyle = "#ff5cae";
      ctx.fillRect(W - 20 - PAD_W, st.rightY, PAD_W, PAD_H);
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.arc(st.bx, st.by, BALL, 0, Math.PI * 2);
      ctx.fill();

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, keys]);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#0b0d12] to-[#1c2230] p-4">
      <div className="flex items-center gap-8 mb-3 text-white">
        <div className="text-center">
          <div className="text-[10px] uppercase opacity-60">Player 1 (W/S)</div>
          <div className="text-3xl font-black text-[var(--accent)]">{score.left}</div>
        </div>
        <div className="text-white/40 text-xl">vs</div>
        <div className="text-center">
          <div className="text-[10px] uppercase opacity-60">Player 2 (↑/↓)</div>
          <div className="text-3xl font-black text-[var(--accent-2)]">{score.right}</div>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="rounded-xl border border-white/10"
        style={{ width: "min(90vw, 800px)", aspectRatio: `${W}/${H}`, height: "auto", maxHeight: "70vh" }}
      />
      <button
        onClick={reset}
        className="mt-3 px-4 py-2 rounded-lg bg-white text-black text-xs font-bold hover:scale-105 transition-transform"
      >
        Reset score
      </button>
    </div>
  );
}
