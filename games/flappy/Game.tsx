"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";
import { SoundToggle } from "@/components/SoundToggle";
import { GameOverlay, PauseToggle } from "@/components/games/GameOverlay";
import { Sfx } from "@/lib/sound";

const W = 480;
const H = 640;
const BIRD_X = 120;
const BIRD_R = 14;
const GAP = 160;
const PIPE_W = 70;
const PIPE_GAP_X = 220;
const GRAVITY = 1500;
const FLAP = -420;

type Pipe = { x: number; gapY: number; passed: boolean };

function makeInitialPipes(): Pipe[] {
  return [
    { x: W + 200, gapY: 100 + Math.random() * (H - 200 - GAP), passed: false },
    {
      x: W + 200 + PIPE_GAP_X,
      gapY: 100 + Math.random() * (H - 200 - GAP),
      passed: false,
    },
  ];
}

export default function Flappy() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [phase, setPhase] = useState<"ready" | "play" | "over">("ready");
  const [paused, setPaused] = useState(false);
  const submitStatus = useSubmitScoreOnGameOver("flappy", score, phase === "over");

  const stateRef = useRef({
    y: H / 2,
    vy: 0,
    pipes: makeInitialPipes(),
    nextPipeAt: 0,
  });

  useEffect(() => {
    setBest(Number(localStorage.getItem("nexplay:flappy-best") || 0));
  }, []);

  const reset = useCallback(() => {
    stateRef.current = {
      y: H / 2,
      vy: 0,
      pipes: makeInitialPipes(),
      nextPipeAt: 0,
    };
    setScore(0);
    setPhase("ready");
    setPaused(false);
  }, []);

  const togglePause = useCallback(() => {
    if (phase !== "play") return;
    setPaused((p) => !p);
  }, [phase]);

  const flap = useCallback(() => {
    if (phase === "ready") setPhase("play");
    if (phase === "over") return;
    if (paused) {
      setPaused(false);
      return;
    }
    stateRef.current.vy = FLAP;
    Sfx.jump();
  }, [phase, paused]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "ArrowUp") {
        e.preventDefault();
        flap();
      } else if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flap, togglePause]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const st = stateRef.current;

      if (phase === "play" && !paused) {
        st.vy += GRAVITY * dt;
        st.y += st.vy * dt;

        // pipes scroll
        for (const p of st.pipes) p.x -= 200 * dt;
        if (st.pipes.length > 0 && st.pipes[0].x < -PIPE_W) {
          st.pipes.shift();
          const lastX = st.pipes.length > 0
            ? st.pipes[st.pipes.length - 1].x
            : W;
          st.pipes.push({
            x: lastX + PIPE_GAP_X,
            gapY: 100 + Math.random() * (H - 200 - GAP),
            passed: false,
          });
        }

        // collisions
        if (st.y + BIRD_R > H || st.y - BIRD_R < 0) {
          if (phase === "play") {
            setPhase("over");
            Sfx.gameOver();
          }
        }
        for (const p of st.pipes) {
          if (
            BIRD_X + BIRD_R > p.x &&
            BIRD_X - BIRD_R < p.x + PIPE_W &&
            (st.y - BIRD_R < p.gapY || st.y + BIRD_R > p.gapY + GAP)
          ) {
            if (phase === "play") {
              setPhase("over");
              Sfx.gameOver();
            }
          }
          if (!p.passed && p.x + PIPE_W < BIRD_X) {
            p.passed = true;
            Sfx.pickup();
            setScore((s) => {
              const n = s + 1;
              setBest((b) => {
                const nb = Math.max(b, n);
                localStorage.setItem("nexplay:flappy-best", String(nb));
                return nb;
              });
              return n;
            });
          }
        }
      }

      // background
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#3a8ec9");
      grad.addColorStop(1, "#7ad9c1");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // pipes
      ctx.fillStyle = "#16a34a";
      for (const p of st.pipes) {
        ctx.fillRect(p.x, 0, PIPE_W, p.gapY);
        ctx.fillRect(p.x, p.gapY + GAP, PIPE_W, H - p.gapY - GAP);
        ctx.fillStyle = "#15803d";
        ctx.fillRect(p.x - 4, p.gapY - 16, PIPE_W + 8, 16);
        ctx.fillRect(p.x - 4, p.gapY + GAP, PIPE_W + 8, 16);
        ctx.fillStyle = "#16a34a";
      }

      // ground
      ctx.fillStyle = "#facc15";
      ctx.fillRect(0, H - 6, W, 6);

      // bird
      ctx.save();
      ctx.translate(BIRD_X, st.y);
      ctx.rotate(Math.max(-0.3, Math.min(1, st.vy / 600)));
      ctx.fillStyle = "#facc15";
      ctx.beginPath();
      ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(5, -4, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f97316";
      ctx.beginPath();
      ctx.moveTo(BIRD_R - 2, 0);
      ctx.lineTo(BIRD_R + 8, 2);
      ctx.lineTo(BIRD_R - 2, 6);
      ctx.fill();
      ctx.restore();

      // score
      ctx.fillStyle = "white";
      ctx.font = "bold 48px system-ui";
      ctx.textAlign = "center";
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 4;
      ctx.strokeText(String(score), W / 2, 80);
      ctx.fillText(String(score), W / 2, 80);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, paused, score]);

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#0a1a2a] to-[#1a3344] p-2 sm:p-3">
      <div className="shrink-0 flex items-center justify-center gap-2 mb-2 text-white text-xs flex-wrap">
        <span className="px-2.5 py-1 rounded-md bg-white/10">
          <span className="opacity-60 mr-1.5">SCORE</span>
          <b className="tabular-nums">{score}</b>
        </span>
        {best > 0 && (
          <span className="px-2.5 py-1 rounded-md bg-amber-500/15 border border-amber-400/30 text-amber-200">
            <span className="opacity-60 mr-1.5">BEST</span>
            <b className="tabular-nums">{best}</b>
          </span>
        )}
        <SoundToggle />
        {phase === "play" && (
          <PauseToggle paused={paused} onClick={togglePause} />
        )}
      </div>
      <div className="flex-1 min-h-0 w-full flex items-center justify-center">
        <div className="relative h-full max-w-full" style={{ aspectRatio: `${W} / ${H}` }}>
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            onClick={flap}
            onTouchStart={(e) => { e.preventDefault(); flap(); }}
            className="absolute inset-0 w-full h-full block rounded-xl border border-white/10 cursor-pointer"
          />
          {paused && phase === "play" && (
            <GameOverlay
              variant="blur"
              icon="⏸"
              title="Paused"
              subtitle={
                <>
                  Press{" "}
                  <kbd className="px-1.5 py-0.5 rounded bg-white/15 border border-white/25 text-white font-mono">
                    P
                  </kbd>{" "}
                  or{" "}
                  <kbd className="px-1.5 py-0.5 rounded bg-white/15 border border-white/25 text-white font-mono">
                    Space
                  </kbd>{" "}
                  to resume
                </>
              }
              primary={{ label: "▶ Resume", onClick: () => setPaused(false) }}
            />
          )}
          {phase === "ready" && (
            <GameOverlay
              variant="blur"
              icon="🐦"
              title="Tap to flap"
              subtitle={
                <>
                  Tap the screen or press{" "}
                  <kbd className="px-1.5 py-0.5 rounded bg-white/15 border border-white/25 text-white font-mono">
                    Space
                  </kbd>{" "}
                  to jump · <kbd className="px-1.5 py-0.5 rounded bg-white/15 border border-white/25 text-white font-mono">P</kbd> pauses.
                </>
              }
              primary={{ label: "▶ Play", onClick: () => flap() }}
            />
          )}
          {phase === "over" && (
            <GameOverlay
              icon="💀"
              title="Game over"
              subtitle={
                <>
                  Score <b>{score}</b>
                  {score >= best && score > 0 ? <> · 🏆 new best!</> : best > 0 ? <> · best {best}</> : null}
                </>
              }
              primary={{ label: "↻ Try again", onClick: reset }}
            >
              <ScoreStatus gameSlug="flappy" status={submitStatus} />
            </GameOverlay>
          )}
        </div>
      </div>
    </div>
  );
}
