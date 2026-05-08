"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";

const W = 800;
const H = 360;
const GROUND = H - 60;
const PLAYER_X = 100;
const PLAYER_R = 18;
const GRAVITY = 1800;
const JUMP = -680;

type Obstacle = { x: number; w: number; h: number; kind: "block" | "spike" };

export default function NeonRunner() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [phase, setPhase] = useState<"ready" | "play" | "over">("ready");
  const submitStatus = useSubmitScoreOnGameOver("neon-runner", score, phase === "over");

  const stateRef = useRef({
    y: GROUND - PLAYER_R,
    vy: 0,
    onGround: true,
    obstacles: [] as Obstacle[],
    spawnAt: 0,
    speed: 360,
    elapsed: 0,
    bgOffset: 0,
  });

  useEffect(() => {
    setBest(Number(localStorage.getItem("nexplay:runner-best") || 0));
  }, []);

  const reset = useCallback(() => {
    stateRef.current = {
      y: GROUND - PLAYER_R,
      vy: 0,
      onGround: true,
      obstacles: [],
      spawnAt: 0.6,
      speed: 360,
      elapsed: 0,
      bgOffset: 0,
    };
    setScore(0);
    setPhase("ready");
  }, []);

  const jump = useCallback(() => {
    if (phase === "ready") setPhase("play");
    if (phase === "over") return;
    const st = stateRef.current;
    if (st.onGround) {
      st.vy = JUMP;
      st.onGround = false;
    }
  }, [phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "ArrowUp" || e.key === "w") {
        e.preventDefault();
        jump();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jump]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const st = stateRef.current;

      if (phase === "play") {
        st.elapsed += dt;
        st.speed = 360 + st.elapsed * 12;
        st.bgOffset = (st.bgOffset + st.speed * dt) % 200;

        st.vy += GRAVITY * dt;
        st.y += st.vy * dt;
        if (st.y >= GROUND - PLAYER_R) {
          st.y = GROUND - PLAYER_R;
          st.vy = 0;
          st.onGround = true;
        }

        st.spawnAt -= dt;
        if (st.spawnAt <= 0) {
          st.spawnAt = 0.6 + Math.random() * 0.8;
          const kind: "block" | "spike" = Math.random() < 0.5 ? "block" : "spike";
          st.obstacles.push({
            x: W + 40,
            w: kind === "block" ? 30 : 24,
            h: kind === "block" ? 30 + Math.random() * 30 : 28,
            kind,
          });
        }
        for (const o of st.obstacles) o.x -= st.speed * dt;
        st.obstacles = st.obstacles.filter((o) => o.x + o.w > -20);

        for (const o of st.obstacles) {
          const ox1 = o.x;
          const ox2 = o.x + o.w;
          const oy = GROUND - o.h;
          if (
            PLAYER_X + PLAYER_R > ox1 &&
            PLAYER_X - PLAYER_R < ox2 &&
            st.y + PLAYER_R > oy
          ) {
            setPhase("over");
            setScore((s) => {
              setBest((b) => {
                const nb = Math.max(b, s);
                localStorage.setItem("nexplay:runner-best", String(nb));
                return nb;
              });
              return s;
            });
          }
        }

        setScore((s) => s + Math.floor(st.speed * dt * 0.05));
      }

      // background gradient
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#1a0a3e");
      g.addColorStop(1, "#3a0a5a");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // city silhouette
      ctx.fillStyle = "rgba(124,92,255,0.3)";
      for (let i = 0; i < 8; i++) {
        const x = ((i * 200 - st.bgOffset * 0.3) % (W + 200)) - 100;
        ctx.fillRect(x, H - 200, 80, 140);
        ctx.fillRect(x + 100, H - 160, 60, 100);
      }
      // ground
      ctx.fillStyle = "#0a0a18";
      ctx.fillRect(0, GROUND, W, H - GROUND);
      ctx.strokeStyle = "#7c5cff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, GROUND); ctx.lineTo(W, GROUND);
      ctx.stroke();
      // lane lines
      ctx.fillStyle = "rgba(255,92,174,0.6)";
      for (let i = 0; i < 12; i++) {
        const x = ((i * 80 - st.bgOffset) % (W + 80)) - 40;
        ctx.fillRect(x, GROUND + 20, 30, 3);
      }

      // obstacles
      for (const o of st.obstacles) {
        const oy = GROUND - o.h;
        if (o.kind === "block") {
          ctx.fillStyle = "#ff5cae";
          ctx.fillRect(o.x, oy, o.w, o.h);
          ctx.fillStyle = "rgba(255,255,255,0.4)";
          ctx.fillRect(o.x + 4, oy + 4, o.w - 8, 4);
        } else {
          ctx.fillStyle = "#facc15";
          ctx.beginPath();
          ctx.moveTo(o.x, GROUND);
          ctx.lineTo(o.x + o.w / 2, oy);
          ctx.lineTo(o.x + o.w, GROUND);
          ctx.fill();
        }
      }

      // player
      ctx.fillStyle = "#7c5cff";
      ctx.shadowColor = "#7c5cff";
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(PLAYER_X, st.y, PLAYER_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.arc(PLAYER_X + 4, st.y - 4, 4, 0, Math.PI * 2);
      ctx.fill();

      // score
      ctx.fillStyle = "white";
      ctx.font = "bold 24px system-ui";
      ctx.fillText(`${score}`, W - 80, 36);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, score]);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#1a0a3e] to-[#0b0d12] p-4">
      <div className="text-white text-xs mb-2">
        Best: <b>{best}</b> • Space / Up to jump
      </div>
      <div className="relative w-full" style={{ maxWidth: 800, aspectRatio: `${W}/${H}`, maxHeight: "70vh" }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onClick={jump}
          onTouchStart={(e) => { e.preventDefault(); jump(); }}
          className="rounded-xl border border-white/10 cursor-pointer w-full h-full"
        />
        {phase !== "play" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-xl pointer-events-none">
            {phase === "ready" ? (
              <>
                <div className="text-3xl font-black text-white mb-2">Tap or press Space</div>
                <div className="text-white/80">to start running</div>
              </>
            ) : (
              <>
                <div className="text-4xl font-black text-white mb-2">Crashed!</div>
                <div className="text-white/80 mb-2">Score: {score}</div>
                <div className="pointer-events-auto mb-3">
                  <ScoreStatus gameSlug="neon-runner" status={submitStatus} />
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); reset(); }}
                  className="pointer-events-auto px-6 py-3 rounded-lg bg-white text-black font-bold hover:scale-105 transition-transform"
                >
                  Run again
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
