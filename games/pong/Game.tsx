"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useKeyboard } from "../useGameLoop";

const W = 800;
const H = 480;
const PAD_W = 12;
const PAD_H = 80;
const BALL = 10;
const TARGET = 5;

type Mode = "ai" | "local";
type Difficulty = "easy" | "medium" | "hard";
type Side = "left" | "right" | null;

const DIFFICULTY: Record<
  Difficulty,
  { speed: number; reaction: number; jitter: number }
> = {
  easy: { speed: 240, reaction: 0.55, jitter: 28 },
  medium: { speed: 340, reaction: 0.78, jitter: 14 },
  hard: { speed: 460, reaction: 0.95, jitter: 4 },
};

function newServe(toward: Side): {
  bx: number;
  by: number;
  bvx: number;
  bvy: number;
} {
  const dir = toward === "left" ? -1 : 1;
  return {
    bx: W / 2,
    by: H / 2,
    bvx: dir * 320,
    bvy: (Math.random() - 0.5) * 240,
  };
}

export default function Pong() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const keys = useKeyboard();
  const [mode, setMode] = useState<Mode>("ai");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [score, setScore] = useState({ left: 0, right: 0 });
  const [winner, setWinner] = useState<Side>(null);
  const [paused, setPaused] = useState(false);
  const [pointFlash, setPointFlash] = useState<Side>(null);
  const [running, setRunning] = useState(true);

  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const winnerRef = useRef<Side>(null);
  winnerRef.current = winner;
  const modeRef = useRef<Mode>(mode);
  modeRef.current = mode;
  const difficultyRef = useRef<Difficulty>(difficulty);
  difficultyRef.current = difficulty;

  const stateRef = useRef({
    leftY: H / 2 - PAD_H / 2,
    rightY: H / 2 - PAD_H / 2,
    ...newServe(Math.random() < 0.5 ? "left" : "right"),
    pauseUntil: 0,
    aiTargetY: H / 2,
  });

  const reset = useCallback(() => {
    stateRef.current = {
      leftY: H / 2 - PAD_H / 2,
      rightY: H / 2 - PAD_H / 2,
      ...newServe(Math.random() < 0.5 ? "left" : "right"),
      pauseUntil: 0,
      aiTargetY: H / 2,
    };
    setScore({ left: 0, right: 0 });
    setWinner(null);
    setPaused(false);
    setPointFlash(null);
    setRunning(true);
  }, []);

  // Mode/difficulty changes restart the match.
  const switchMode = useCallback((next: Mode) => {
    setMode(next);
    setScore({ left: 0, right: 0 });
    setWinner(null);
    setPaused(false);
    stateRef.current = {
      leftY: H / 2 - PAD_H / 2,
      rightY: H / 2 - PAD_H / 2,
      ...newServe(Math.random() < 0.5 ? "left" : "right"),
      pauseUntil: 0,
      aiTargetY: H / 2,
    };
    setRunning(true);
  }, []);

  const togglePause = useCallback(() => {
    if (winnerRef.current) return;
    setPaused((p) => !p);
  }, []);

  // P / Esc to pause
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

  // Touch input — drag on left half controls left paddle, right half
  // controls right paddle (unless we're in AI mode, in which case the
  // whole canvas controls the player paddle).
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const trackY = (clientX: number, clientY: number) => {
      const rect = wrap.getBoundingClientRect();
      const xFrac = (clientX - rect.left) / rect.width;
      const yWorld =
        ((clientY - rect.top) / rect.height) * H - PAD_H / 2;
      const clamped = Math.max(0, Math.min(H - PAD_H, yWorld));
      const st = stateRef.current;
      if (modeRef.current === "ai") {
        st.leftY = clamped;
      } else {
        if (xFrac < 0.5) st.leftY = clamped;
        else st.rightY = clamped;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (winnerRef.current || pausedRef.current) return;
      const t = e.touches[0];
      if (!t) return;
      e.preventDefault();
      trackY(t.clientX, t.clientY);
    };
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      trackY(t.clientX, t.clientY);
    };
    wrap.addEventListener("touchstart", onStart, { passive: true });
    wrap.addEventListener("touchmove", onMove, { passive: false });
    return () => {
      wrap.removeEventListener("touchstart", onStart);
      wrap.removeEventListener("touchmove", onMove);
    };
  }, []);

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
      const live = !pausedRef.current && !winnerRef.current;
      const speed = 380;

      if (live) {
        // Player input — left paddle is always W/S; right paddle is
        // arrow keys in local 2P, AI-controlled in AI mode.
        if (k.has("w") || k.has("W")) st.leftY -= speed * dt;
        if (k.has("s") || k.has("S")) st.leftY += speed * dt;

        if (modeRef.current === "local") {
          if (k.has("ArrowUp")) st.rightY -= speed * dt;
          if (k.has("ArrowDown")) st.rightY += speed * dt;
        } else {
          // AI: track the ball with a tunable response. Recompute the
          // target only every few frames to make easier difficulties feel
          // less robotic. Add a per-difficulty jitter to the target.
          const cfg = DIFFICULTY[difficultyRef.current];
          if (Math.random() < cfg.reaction) {
            // Predict roughly where ball will be when it arrives, only
            // when ball is heading right.
            if (st.bvx > 0) {
              const timeToArrive = Math.max(
                0.05,
                (W - 20 - PAD_W - st.bx) / Math.max(50, st.bvx),
              );
              let predictedY = st.by + st.bvy * timeToArrive;
              // Bounce off walls in prediction
              while (predictedY < 0 || predictedY > H) {
                if (predictedY < 0) predictedY = -predictedY;
                else if (predictedY > H) predictedY = 2 * H - predictedY;
              }
              st.aiTargetY = predictedY + (Math.random() - 0.5) * cfg.jitter;
            } else {
              // Drift back toward center
              st.aiTargetY = H / 2 + (Math.random() - 0.5) * cfg.jitter;
            }
          }
          const center = st.rightY + PAD_H / 2;
          const diff = st.aiTargetY - center;
          const step = Math.max(-cfg.speed * dt, Math.min(cfg.speed * dt, diff));
          st.rightY += step;
        }

        st.leftY = Math.max(0, Math.min(H - PAD_H, st.leftY));
        st.rightY = Math.max(0, Math.min(H - PAD_H, st.rightY));

        // Ball — frozen during point pause so the serve has a beat
        if (now >= st.pauseUntil) {
          st.bx += st.bvx * dt;
          st.by += st.bvy * dt;
          if (st.by < BALL / 2) {
            st.by = BALL / 2;
            st.bvy *= -1;
          }
          if (st.by > H - BALL / 2) {
            st.by = H - BALL / 2;
            st.bvy *= -1;
          }

          // left paddle
          if (
            st.bx - BALL / 2 < 20 + PAD_W &&
            st.bx - BALL / 2 > 20 &&
            st.by > st.leftY &&
            st.by < st.leftY + PAD_H &&
            st.bvx < 0
          ) {
            st.bvx *= -1.06;
            st.bvy +=
              ((st.by - (st.leftY + PAD_H / 2)) / (PAD_H / 2)) * 220;
            st.bvx = Math.max(-680, Math.min(680, st.bvx));
            st.bvy = Math.max(-560, Math.min(560, st.bvy));
            st.bx = 20 + PAD_W + BALL / 2;
          }
          // right paddle
          if (
            st.bx + BALL / 2 > W - 20 - PAD_W &&
            st.bx + BALL / 2 < W - 20 &&
            st.by > st.rightY &&
            st.by < st.rightY + PAD_H &&
            st.bvx > 0
          ) {
            st.bvx *= -1.06;
            st.bvy +=
              ((st.by - (st.rightY + PAD_H / 2)) / (PAD_H / 2)) * 220;
            st.bvx = Math.max(-680, Math.min(680, st.bvx));
            st.bvy = Math.max(-560, Math.min(560, st.bvy));
            st.bx = W - 20 - PAD_W - BALL / 2;
          }

          // scoring
          if (st.bx < -20 || st.bx > W + 20) {
            const scorer: Side = st.bx < -20 ? "right" : "left";
            setPointFlash(scorer);
            setTimeout(() => setPointFlash(null), 350);
            setScore((s) => {
              const next = {
                ...s,
                [scorer]: s[scorer] + 1,
              } as { left: number; right: number };
              if (next[scorer] >= TARGET) setWinner(scorer);
              return next;
            });
            const towardLoser: Side = st.bx < -20 ? "left" : "right";
            const fresh = newServe(towardLoser);
            st.bx = fresh.bx;
            st.by = fresh.by;
            st.bvx = fresh.bvx;
            st.bvy = fresh.bvy;
            st.pauseUntil = now + 800;
          }
        }
      }

      // ---- DRAW ----
      // Backdrop
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#0b0d12");
      grad.addColorStop(1, "#1c2230");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Court border
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 2;
      ctx.strokeRect(8, 8, W - 16, H - 16);

      // Center line
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 14]);
      ctx.beginPath();
      ctx.moveTo(W / 2, 14);
      ctx.lineTo(W / 2, H - 14);
      ctx.stroke();
      ctx.setLineDash([]);

      // Center circle for visual interest
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 60, 0, Math.PI * 2);
      ctx.stroke();

      // Scores baked into canvas, large and centered
      ctx.font = "bold 86px system-ui";
      ctx.fillStyle = "rgba(124, 92, 255, 0.18)";
      ctx.textAlign = "right";
      ctx.fillText(`${score.left}`, W / 2 - 32, H / 2 + 30);
      ctx.fillStyle = "rgba(255, 92, 174, 0.18)";
      ctx.textAlign = "left";
      ctx.fillText(`${score.right}`, W / 2 + 32, H / 2 + 30);
      ctx.textAlign = "left";

      // Paddles with soft glow
      ctx.shadowColor = "#7c5cff";
      ctx.shadowBlur = 12;
      ctx.fillStyle = "#7c5cff";
      ctx.fillRect(20, st.leftY, PAD_W, PAD_H);
      ctx.shadowColor = "#ff5cae";
      ctx.fillStyle = "#ff5cae";
      ctx.fillRect(W - 20 - PAD_W, st.rightY, PAD_W, PAD_H);
      ctx.shadowBlur = 0;

      // Ball with glow
      ctx.shadowColor = "white";
      ctx.shadowBlur = 14;
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.arc(st.bx, st.by, BALL, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, keys, score]);

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#0b0d12] to-[#1c2230] p-2 sm:p-3">
      {/* Mode selector */}
      <div className="shrink-0 flex items-center justify-center gap-1.5 mb-2 flex-wrap">
        <ModeTab
          active={mode === "ai"}
          onClick={() => switchMode("ai")}
          icon="🤖"
          label="vs AI"
        />
        <ModeTab
          active={mode === "local"}
          onClick={() => switchMode("local")}
          icon="👥"
          label="2 Player"
        />
        <Link
          href="/multiplayer/pong"
          className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] text-white text-xs font-bold hover:scale-105 transition-transform inline-flex items-center gap-1.5"
        >
          🌐 Online →
        </Link>
        {!winner && mode !== ("online" as Mode) && (
          <button
            onClick={togglePause}
            className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors"
          >
            {paused ? "▶ Resume" : "⏸ Pause"}
          </button>
        )}
      </div>

      {/* Difficulty (AI only) + scoreboard */}
      <div className="shrink-0 flex items-center justify-center gap-3 mb-2 text-white text-xs">
        {mode === "ai" && (
          <div className="inline-flex rounded-lg bg-white/5 p-0.5">
            {(["easy", "medium", "hard"] as const).map((d) => (
              <button
                key={d}
                onClick={() => {
                  setDifficulty(d);
                  setScore({ left: 0, right: 0 });
                  setWinner(null);
                }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold capitalize transition-colors ${
                  difficulty === d
                    ? "bg-white/15 text-white"
                    : "text-white/60 hover:text-white"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        )}
        <div className="opacity-70">
          First to <b>{TARGET}</b>
        </div>
        <div className="opacity-50 hidden sm:inline">·</div>
        <div className="opacity-70 hidden sm:inline">
          {mode === "ai" ? (
            <>
              You <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono">W/S</kbd> · AI on right
            </>
          ) : (
            <>
              <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono">W/S</kbd> left · <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono">↑↓</kbd> right
            </>
          )}
        </div>
      </div>

      {/* Court */}
      <div className="flex-1 min-h-0 w-full flex items-center justify-center">
        <div
          ref={wrapRef}
          className="relative h-full max-w-full touch-none"
          style={{ aspectRatio: `${W} / ${H}` }}
        >
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="absolute inset-0 w-full h-full block rounded-xl border border-white/10"
          />

          {/* Per-side flash on point */}
          {pointFlash === "left" && (
            <div className="absolute inset-y-0 left-0 w-1/2 rounded-l-xl bg-[var(--accent)]/20 pointer-events-none animate-pulse" />
          )}
          {pointFlash === "right" && (
            <div className="absolute inset-y-0 right-0 w-1/2 rounded-r-xl bg-[var(--accent-2)]/20 pointer-events-none animate-pulse" />
          )}

          {paused && !winner && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/65 backdrop-blur-sm rounded-xl gap-2">
              <div className="text-5xl mb-1">⏸</div>
              <div className="text-3xl font-black text-white mb-1">Paused</div>
              <div className="text-white/70 text-xs mb-3">
                Press <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono">P</kbd> to resume
              </div>
              <button
                onClick={() => setPaused(false)}
                className="px-6 py-3 rounded-lg bg-white text-black font-bold hover:scale-105 transition-transform"
              >
                ▶ Resume
              </button>
            </div>
          )}

          {winner && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 rounded-xl gap-2">
              <div className="text-5xl mb-1">🏆</div>
              <div className="text-3xl font-black text-white">
                {mode === "ai"
                  ? winner === "left"
                    ? "You win!"
                    : "AI wins"
                  : winner === "left"
                    ? "Player 1 wins!"
                    : "Player 2 wins!"}
              </div>
              <div className="text-white/80">
                {score.left} – {score.right}
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={reset}
                  className="px-5 py-2.5 rounded-lg bg-white text-black font-bold hover:scale-105 transition-transform"
                >
                  Rematch
                </button>
                <Link
                  href="/multiplayer/pong"
                  className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] text-white font-bold hover:scale-105 transition-transform"
                >
                  Play online
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1.5 ${
        active
          ? "bg-white text-black"
          : "bg-white/10 text-white/80 hover:bg-white/15"
      }`}
    >
      <span>{icon}</span> {label}
    </button>
  );
}
