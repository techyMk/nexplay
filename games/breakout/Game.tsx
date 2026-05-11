"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useKeyboard } from "../useGameLoop";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";
import { SoundToggle } from "@/components/SoundToggle";
import { GameOverlay, PauseToggle } from "@/components/games/GameOverlay";
import { Sfx } from "@/lib/sound";

const W = 800;
const H = 540;
const PADDLE_W = 120;
const PADDLE_H = 14;
const BALL_R = 8;
const BRICK_ROWS = 6;
const BRICK_COLS = 12;
const BRICK_W = (W - 40) / BRICK_COLS;
const BRICK_H = 22;

type Brick = { x: number; y: number; alive: boolean; color: string };
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
};
type Trail = { x: number; y: number; life: number };

const BRICK_COLORS = ["#ef4444", "#f97316", "#facc15", "#16a34a", "#06b6d4", "#7c5cff"];

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
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Mix the given hex colour with white by `amount` (0..1). Used to
 *  derive the lighter top edge of the brick gradient. */
function lighten(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mr = Math.round(r + (255 - r) * amount);
  const mg = Math.round(g + (255 - g) * amount);
  const mb = Math.round(b + (255 - b) * amount);
  return `rgb(${mr},${mg},${mb})`;
}

function makeBricks(): Brick[] {
  const bricks: Brick[] = [];
  for (let r = 0; r < BRICK_ROWS; r++) {
    for (let c = 0; c < BRICK_COLS; c++) {
      bricks.push({
        x: 20 + c * BRICK_W,
        y: 60 + r * BRICK_H,
        alive: true,
        color: BRICK_COLORS[r % BRICK_COLORS.length],
      });
    }
  }
  return bricks;
}

export default function Breakout() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keys = useKeyboard();
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [lives, setLives] = useState(3);
  const [phase, setPhase] = useState<"ready" | "play" | "over" | "won">("ready");
  const [paused, setPaused] = useState(false);
  const submitStatus = useSubmitScoreOnGameOver("breakout", score, phase === "over" || phase === "won");

  const stateRef = useRef<{
    paddleX: number;
    bx: number;
    by: number;
    bvx: number;
    bvy: number;
    bricks: Brick[];
    particles: Particle[];
    trail: Trail[];
  }>({
    paddleX: W / 2,
    bx: W / 2,
    by: H - 60,
    bvx: 0,
    bvy: 0,
    bricks: makeBricks(),
    particles: [],
    trail: [],
  });

  useEffect(() => setBest(Number(localStorage.getItem("nexplay:breakout-best") || 0)), []);

  // Persist personal best whenever a run ends (game over OR cleared).
  // Lives-loss path used to set best inline inside nested setState
  // callbacks — pulling it out into its own effect keeps the run-end
  // handling consistent with our other games.
  useEffect(() => {
    if (phase !== "over" && phase !== "won") return;
    if (score <= best) return;
    setBest(score);
    try {
      localStorage.setItem("nexplay:breakout-best", String(score));
    } catch {
      // localStorage can throw in private mode — best is nice-to-have
    }
  }, [phase, score, best]);

  const launch = useCallback(() => {
    if (phase === "over" || phase === "won") return;
    const st = stateRef.current;
    const angle = Math.random() * 0.6 - 0.3 - Math.PI / 2;
    st.bvx = Math.cos(angle) * 380;
    st.bvy = Math.sin(angle) * 380;
    Sfx.shoot();
    setPhase("play");
  }, [phase]);

  const reset = useCallback(() => {
    stateRef.current = {
      paddleX: W / 2,
      bx: W / 2,
      by: H - 60,
      bvx: 0,
      bvy: 0,
      bricks: makeBricks(),
      particles: [],
      trail: [],
    };
    setScore(0);
    setLives(3);
    setPhase("ready");
    setPaused(false);
  }, []);

  const togglePause = useCallback(() => {
    if (phase !== "play") return;
    setPaused((p) => !p);
  }, [phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "ArrowUp") {
        e.preventDefault();
        if (phase === "ready") launch();
      } else if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, launch, togglePause]);

  // Touch input — paddle follows the finger horizontally; tap launches
  // the ball when in "ready" phase.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const trackX = (clientX: number) => {
      const rect = canvas.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * W;
      stateRef.current.paddleX = Math.max(
        PADDLE_W / 2,
        Math.min(W - PADDLE_W / 2, x),
      );
    };
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      trackX(t.clientX);
    };
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      e.preventDefault();
      trackX(t.clientX);
    };
    const onTap = () => {
      if (phase === "ready") launch();
    };
    canvas.addEventListener("touchstart", onStart, { passive: true });
    canvas.addEventListener("touchmove", onMove, { passive: false });
    canvas.addEventListener("touchend", onTap, { passive: true });
    return () => {
      canvas.removeEventListener("touchstart", onStart);
      canvas.removeEventListener("touchmove", onMove);
      canvas.removeEventListener("touchend", onTap);
    };
  }, [phase, launch]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      const k = keys.current;

      if (!paused) {
        if (k.has("ArrowLeft") || k.has("a")) st.paddleX -= 540 * dt;
        if (k.has("ArrowRight") || k.has("d")) st.paddleX += 540 * dt;
        st.paddleX = Math.max(PADDLE_W / 2, Math.min(W - PADDLE_W / 2, st.paddleX));
      }

      if (phase === "ready") {
        st.bx = st.paddleX;
        st.by = H - 60;
      }

      if (phase === "play" && !paused) {
        st.bx += st.bvx * dt;
        st.by += st.bvy * dt;
        // Trail crumbs every tick — fade out over ~0.25s for a soft
        // motion streak behind the ball.
        st.trail.push({ x: st.bx, y: st.by, life: 1 });
        if (st.trail.length > 18) st.trail.shift();
        if (st.bx < BALL_R) { st.bx = BALL_R; st.bvx *= -1; Sfx.bounce(); }
        if (st.bx > W - BALL_R) { st.bx = W - BALL_R; st.bvx *= -1; Sfx.bounce(); }
        if (st.by < BALL_R) { st.by = BALL_R; st.bvy *= -1; Sfx.bounce(); }
        // paddle
        if (
          st.by + BALL_R > H - 30 - PADDLE_H &&
          st.by + BALL_R < H - 30 &&
          Math.abs(st.bx - st.paddleX) < PADDLE_W / 2 + BALL_R &&
          st.bvy > 0
        ) {
          const offset = (st.bx - st.paddleX) / (PADDLE_W / 2);
          const angle = (-Math.PI / 2) + offset * (Math.PI / 3);
          const speed = Math.min(640, Math.hypot(st.bvx, st.bvy) * 1.02);
          st.bvx = Math.cos(angle) * speed;
          st.bvy = Math.sin(angle) * speed;
          st.by = H - 30 - PADDLE_H - BALL_R;
          Sfx.bounce();
        }
        if (st.by > H + 40) {
          Sfx.hit();
          st.trail.length = 0;
          setLives((l) => {
            const nl = l - 1;
            if (nl <= 0) {
              setPhase("over");
              Sfx.gameOver();
            } else {
              setPhase("ready");
            }
            return Math.max(0, nl);
          });
        }
        // bricks
        let aliveCount = 0;
        for (const b of st.bricks) {
          if (!b.alive) continue;
          aliveCount++;
          if (
            st.bx + BALL_R > b.x &&
            st.bx - BALL_R < b.x + BRICK_W &&
            st.by + BALL_R > b.y &&
            st.by - BALL_R < b.y + BRICK_H
          ) {
            b.alive = false;
            setScore((s) => s + 10);
            Sfx.match();
            // Spawn a small confetti burst from the brick centre. Cap
            // total particles so a fast clear doesn't tank framerate.
            const cx = b.x + BRICK_W / 2;
            const cy = b.y + BRICK_H / 2;
            for (let i = 0; i < 8 && st.particles.length < 120; i++) {
              const a = Math.random() * Math.PI * 2;
              const sp = 80 + Math.random() * 140;
              st.particles.push({
                x: cx,
                y: cy,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp,
                life: 1,
                color: b.color,
              });
            }
            // simple bounce: pick the side with smaller penetration
            const dxL = st.bx + BALL_R - b.x;
            const dxR = b.x + BRICK_W - (st.bx - BALL_R);
            const dyT = st.by + BALL_R - b.y;
            const dyB = b.y + BRICK_H - (st.by - BALL_R);
            const m = Math.min(dxL, dxR, dyT, dyB);
            if (m === dxL || m === dxR) st.bvx *= -1;
            else st.bvy *= -1;
            break;
          }
        }
        if (aliveCount === 0) {
          setPhase("won");
          Sfx.win();
        }

        // Advance particles + trail
        for (const p of st.particles) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 480 * dt; // gravity
          p.vx *= 0.985;
          p.life -= dt * 1.6;
        }
        st.particles = st.particles.filter((p) => p.life > 0);
        for (const t of st.trail) t.life -= dt * 4;
        st.trail = st.trail.filter((t) => t.life > 0);
      }

      // draw — vertical gradient with a soft purple wash at the top
      // for a subtle "arena" feel without overwhelming the bricks.
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#15102e");
      grad.addColorStop(0.55, "#0a0a1a");
      grad.addColorStop(1, "#06060d");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Subtle starfield band — purely decorative, doesn't move.
      // Drawn deterministically from a hash so it's stable per frame.
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      for (let i = 0; i < 60; i++) {
        const x = (i * 137) % W;
        const y = (i * 89) % (H - 80);
        ctx.fillRect(x, y, 1, 1);
      }

      // bricks
      for (const b of st.bricks) {
        if (!b.alive) continue;
        const bg = ctx.createLinearGradient(b.x, b.y, b.x, b.y + BRICK_H);
        bg.addColorStop(0, lighten(b.color, 0.35));
        bg.addColorStop(1, b.color);
        ctx.fillStyle = bg;
        roundRect(ctx, b.x + 1, b.y + 1, BRICK_W - 2, BRICK_H - 2, 4);
        ctx.fill();
        // Top highlight strip
        ctx.fillStyle = "rgba(255,255,255,0.32)";
        roundRect(ctx, b.x + 3, b.y + 2, BRICK_W - 6, 3, 1.5);
        ctx.fill();
      }

      // particles (drawn before the paddle/ball so the ball stays on top)
      for (const p of st.particles) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
      }
      ctx.globalAlpha = 1;

      // ball trail
      for (let i = 0; i < st.trail.length; i++) {
        const t = st.trail[i];
        const a = (i / st.trail.length) * t.life * 0.6;
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.fillStyle = "#a5b4fc";
        ctx.arc(t.x, t.y, BALL_R * (0.4 + (i / st.trail.length) * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // paddle — gradient fill with glow
      const pgrad = ctx.createLinearGradient(0, H - 30 - PADDLE_H, 0, H - 30);
      pgrad.addColorStop(0, "#a78bfa");
      pgrad.addColorStop(1, "#5b21b6");
      ctx.fillStyle = pgrad;
      ctx.shadowColor = "#7c5cff";
      ctx.shadowBlur = 18;
      roundRect(
        ctx,
        st.paddleX - PADDLE_W / 2,
        H - 30 - PADDLE_H,
        PADDLE_W,
        PADDLE_H,
        7,
      );
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      roundRect(
        ctx,
        st.paddleX - PADDLE_W / 2 + 4,
        H - 30 - PADDLE_H + 2,
        PADDLE_W - 8,
        3,
        1.5,
      );
      ctx.fill();

      // ball
      ctx.beginPath();
      ctx.fillStyle = "white";
      ctx.shadowColor = "white";
      ctx.shadowBlur = 14;
      ctx.arc(st.bx, st.by, BALL_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // hud
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.font = "bold 20px system-ui";
      ctx.fillText(`Score: ${score}`, 14, 30);
      ctx.textAlign = "right";
      // Hearts as soft red glyphs so they read as a life count
      ctx.fillStyle = "#ff6b8a";
      ctx.fillText("♥".repeat(lives), W - 14, 30);
      ctx.textAlign = "left";

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [keys, phase, paused, score, lives]);

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#0a0218] to-[#0b0d12] p-2 sm:p-3">
      <div className="shrink-0 flex items-center justify-center gap-2 mb-2 text-white text-xs flex-wrap">
        <span>
          Score: <b>{score}</b> · Best: <b>{best}</b> · Lives:{" "}
          <b className="text-rose-300">{"♥".repeat(lives) || "—"}</b>
        </span>
        <span className="opacity-70 hidden sm:inline">
          Arrows / A,D or drag · Space / tap to launch · P pauses
        </span>
        <SoundToggle />
        {phase === "play" && (
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
            className="absolute inset-0 w-full h-full block rounded-xl border border-white/10 shadow-[0_0_60px_-20px_rgba(124,92,255,0.5)]"
          />
          {phase === "ready" && (
            <GameOverlay
              variant="blur"
              icon="🧱"
              title={lives === 3 && score === 0 ? "Breakout" : "Ready"}
              subtitle={
                lives === 3 && score === 0
                  ? "Bounce the ball off the paddle and clear every brick. Catch the ball off the edge of the paddle to angle your shot."
                  : `Lives left: ${lives}`
              }
              primary={{ label: "▶ Launch", onClick: launch }}
            />
          )}
          {paused && phase === "play" && (
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
          {phase === "over" && (
            <GameOverlay
              icon="💥"
              title="Game over"
              subtitle={
                <>
                  Score <b>{score}</b>
                  {best > 0 && score >= best && score > 0 ? (
                    <> · 🏆 new best!</>
                  ) : (
                    <> · best {best}</>
                  )}
                </>
              }
              primary={{ label: "↻ Play again", onClick: reset }}
            >
              <ScoreStatus gameSlug="breakout" status={submitStatus} />
            </GameOverlay>
          )}
          {phase === "won" && (
            <GameOverlay
              icon="🏆"
              title="You cleared it!"
              subtitle={
                <>
                  Score <b>{score}</b>
                  {best > 0 && score >= best ? <> · new best!</> : null}
                </>
              }
              primary={{ label: "↻ Play again", onClick: reset }}
            >
              <ScoreStatus gameSlug="breakout" status={submitStatus} />
            </GameOverlay>
          )}
        </div>
      </div>
    </div>
  );
}
