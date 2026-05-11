"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";
import { GameOverlay, PauseToggle } from "@/components/games/GameOverlay";
import { SoundToggle } from "@/components/SoundToggle";
import { Sfx } from "@/lib/sound";

const COLS = 24;
const ROWS = 18;
const CELL = 22;
const W = COLS * CELL;
const H = ROWS * CELL;

type Pt = { x: number; y: number };
type Dir = "up" | "down" | "left" | "right";
type Difficulty = "easy" | "medium" | "hard";

const VEC: Record<Dir, Pt> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPP: Record<Dir, Dir> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

const DIFFICULTY: Record<
  Difficulty,
  { startSpeed: number; capSpeed: number; speedStep: number }
> = {
  easy: { startSpeed: 6, capSpeed: 11, speedStep: 0.15 },
  medium: { startSpeed: 8, capSpeed: 16, speedStep: 0.25 },
  hard: { startSpeed: 11, capSpeed: 22, speedStep: 0.35 },
};

const NORMAL_FOOD_PTS = 10;
const BONUS_FOOD_PTS = 50;
const BONUS_LIFESPAN = 8; // seconds
const BONUS_INTERVAL_MIN = 12; // seconds
const BONUS_INTERVAL_MAX = 20;

function spawnFood(snake: Pt[], extra: Pt | null = null): Pt {
  while (true) {
    const f = {
      x: Math.floor(Math.random() * COLS),
      y: Math.floor(Math.random() * ROWS),
    };
    if (snake.some((s) => s.x === f.x && s.y === f.y)) continue;
    if (extra && extra.x === f.x && extra.y === f.y) continue;
    return f;
  }
}

const INITIAL_SNAKE: Pt[] = [
  { x: 12, y: 9 },
  { x: 11, y: 9 },
  { x: 10, y: 9 },
];

export default function Snake() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [length, setLength] = useState(INITIAL_SNAKE.length);
  const [bestByDiff, setBestByDiff] = useState<Record<Difficulty, number>>({
    easy: 0,
    medium: 0,
    hard: 0,
  });
  const [over, setOver] = useState(false);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [hudSpeed, setHudSpeed] = useState(0);
  const submitStatus = useSubmitScoreOnGameOver("snake", score, over);

  const stateRef = useRef({
    snake: INITIAL_SNAKE.map((s) => ({ ...s })),
    dir: "right" as Dir,
    nextDir: "right" as Dir,
    food: { x: 16, y: 9 } as Pt,
    bonus: null as { pos: Pt; life: number } | null,
    bonusCountdown: 14,
    acc: 0,
    speed: DIFFICULTY.medium.startSpeed,
  });

  useEffect(() => {
    const stored: Record<Difficulty, number> = {
      easy: Number(localStorage.getItem("nexplay:snake-best-easy") || 0),
      medium: Number(
        localStorage.getItem("nexplay:snake-best-medium") ||
          localStorage.getItem("nexplay:snake-best") || // legacy key
          0,
      ),
      hard: Number(localStorage.getItem("nexplay:snake-best-hard") || 0),
    };
    setBestByDiff(stored);
  }, []);

  const reset = useCallback((nextDifficulty: Difficulty = difficulty) => {
    const cfg = DIFFICULTY[nextDifficulty];
    const fresh = INITIAL_SNAKE.map((s) => ({ ...s }));
    stateRef.current = {
      snake: fresh,
      dir: "right",
      nextDir: "right",
      food: spawnFood(fresh),
      bonus: null,
      bonusCountdown:
        BONUS_INTERVAL_MIN +
        Math.random() * (BONUS_INTERVAL_MAX - BONUS_INTERVAL_MIN),
      acc: 0,
      speed: cfg.startSpeed,
    };
    setHudSpeed(cfg.startSpeed);
    setScore(0);
    setLength(fresh.length);
    setOver(false);
    setRunning(false);
    setStarted(false);
    setPaused(false);
  }, [difficulty]);

  const start = useCallback(() => {
    setStarted(true);
    setRunning(true);
    setPaused(false);
  }, []);

  const togglePause = useCallback(() => {
    if (over || !started) return;
    setPaused((p) => !p);
  }, [over, started]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        e.preventDefault();
        togglePause();
        return;
      }
      const map: Record<string, Dir> = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
        w: "up", s: "down", a: "left", d: "right",
        W: "up", S: "down", A: "left", D: "right",
      };
      const d = map[e.key];
      if (!d) return;
      e.preventDefault();
      const cur = stateRef.current.dir;
      if (OPP[cur] !== d) stateRef.current.nextDir = d;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePause]);

  // Touch swipe
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let startX = 0;
    let startY = 0;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
    };
    const onEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) < 16 && Math.abs(dy) < 16) return;
      const dir: Dir =
        Math.abs(dx) > Math.abs(dy)
          ? dx > 0
            ? "right"
            : "left"
          : dy > 0
            ? "down"
            : "up";
      const cur = stateRef.current.dir;
      if (OPP[cur] !== dir) stateRef.current.nextDir = dir;
    };
    canvas.addEventListener("touchstart", onStart, { passive: true });
    canvas.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      canvas.removeEventListener("touchstart", onStart);
      canvas.removeEventListener("touchend", onEnd);
    };
  }, []);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const st = stateRef.current;
      const live = running && !paused && !over;
      const cfg = DIFFICULTY[difficulty];

      if (live) {
        // Bonus spawn / decay
        if (st.bonus) {
          st.bonus.life -= dt;
          if (st.bonus.life <= 0) st.bonus = null;
        } else {
          st.bonusCountdown -= dt;
          if (st.bonusCountdown <= 0) {
            st.bonus = {
              pos: spawnFood(st.snake, st.food),
              life: BONUS_LIFESPAN,
            };
            st.bonusCountdown =
              BONUS_INTERVAL_MIN +
              Math.random() * (BONUS_INTERVAL_MAX - BONUS_INTERVAL_MIN);
          }
        }

        // Movement steps (catch up if frame was slow)
        st.acc += dt;
        const step = 1 / st.speed;
        while (st.acc >= step) {
          st.acc -= step;
          st.dir = st.nextDir;
          const head = st.snake[0];
          const v = VEC[st.dir];
          const nh = { x: head.x + v.x, y: head.y + v.y };
          // Self / wall collision
          if (
            nh.x < 0 ||
            nh.x >= COLS ||
            nh.y < 0 ||
            nh.y >= ROWS ||
            st.snake.some((s) => s.x === nh.x && s.y === nh.y)
          ) {
            setOver(true);
            setRunning(false);
            Sfx.gameOver();
            setScore((finalScore) => {
              setBestByDiff((prev) => {
                const cur = prev[difficulty];
                if (finalScore > cur) {
                  const nextMap = { ...prev, [difficulty]: finalScore };
                  localStorage.setItem(
                    `nexplay:snake-best-${difficulty}`,
                    String(finalScore),
                  );
                  return nextMap;
                }
                return prev;
              });
              return finalScore;
            });
            break;
          }

          st.snake.unshift(nh);

          // Eat normal food
          if (nh.x === st.food.x && nh.y === st.food.y) {
            st.food = spawnFood(st.snake, st.bonus?.pos ?? null);
            setScore((s) => s + NORMAL_FOOD_PTS);
            setLength(st.snake.length);
            st.speed = Math.min(cfg.capSpeed, st.speed + cfg.speedStep);
            setHudSpeed(st.speed);
            Sfx.pickup();
          } else if (
            st.bonus &&
            nh.x === st.bonus.pos.x &&
            nh.y === st.bonus.pos.y
          ) {
            // Eat bonus
            st.bonus = null;
            setScore((s) => s + BONUS_FOOD_PTS);
            Sfx.bigPickup();
            setLength(st.snake.length);
            // Bonus also gives a small speed bump
            st.speed = Math.min(cfg.capSpeed, st.speed + cfg.speedStep * 0.5);
            setHudSpeed(st.speed);
          } else {
            st.snake.pop();
          }
        }
      }

      // ---- DRAW ----
      // Backdrop
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#0a1f0d");
      bg.addColorStop(1, "#0b0d12");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Subtle grid
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= COLS; x++) {
        ctx.beginPath();
        ctx.moveTo(x * CELL, 0);
        ctx.lineTo(x * CELL, H);
        ctx.stroke();
      }
      for (let y = 0; y <= ROWS; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * CELL);
        ctx.lineTo(W, y * CELL);
        ctx.stroke();
      }

      // Food (normal) — pulsing pink dot
      const pulse = 0.85 + 0.15 * Math.sin(now * 0.006);
      const fx = st.food.x * CELL + CELL / 2;
      const fy = st.food.y * CELL + CELL / 2;
      ctx.fillStyle = "rgba(255,92,174,0.25)";
      ctx.beginPath();
      ctx.arc(fx, fy, (CELL / 2) * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ff5cae";
      ctx.beginPath();
      ctx.arc(fx, fy, CELL / 2 - 4, 0, Math.PI * 2);
      ctx.fill();
      // sparkle
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.beginPath();
      ctx.arc(fx - 3, fy - 4, 2, 0, Math.PI * 2);
      ctx.fill();

      // Bonus food — golden, rotating star with lifespan ring
      if (st.bonus) {
        const bx = st.bonus.pos.x * CELL + CELL / 2;
        const by = st.bonus.pos.y * CELL + CELL / 2;
        const pct = Math.max(0, st.bonus.life / BONUS_LIFESPAN);
        // Glow
        const grad = ctx.createRadialGradient(bx, by, 1, bx, by, CELL);
        grad.addColorStop(0, "rgba(252,211,77,0.7)");
        grad.addColorStop(1, "rgba(252,211,77,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(bx - CELL, by - CELL, CELL * 2, CELL * 2);
        // Lifespan ring
        ctx.strokeStyle = `hsl(${pct * 60 + 0}, 95%, ${pct > 0.3 ? 60 : 50}%)`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(
          bx,
          by,
          CELL / 2 - 1,
          -Math.PI / 2,
          -Math.PI / 2 + pct * Math.PI * 2,
        );
        ctx.stroke();
        // Star
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(now * 0.002);
        ctx.fillStyle = "#facc15";
        ctx.beginPath();
        const spikes = 5;
        const outer = CELL / 2 - 4;
        const inner = outer * 0.5;
        for (let i = 0; i < spikes * 2; i++) {
          const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
          const r = i % 2 === 0 ? outer : inner;
          const px = Math.cos(a) * r;
          const py = Math.sin(a) * r;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // Snake — head, body, tail
      const headColor = "#a78bfa";
      st.snake.forEach((s, i) => {
        const cx = s.x * CELL + CELL / 2;
        const cy = s.y * CELL + CELL / 2;
        const isHead = i === 0;
        const isTail = i === st.snake.length - 1;
        // Body fill — fade slightly toward tail for dimension
        const fade = i / Math.max(1, st.snake.length - 1);
        const color = isHead
          ? headColor
          : isTail
            ? `rgba(124,92,255,${0.55 - fade * 0.05})`
            : `rgba(124,92,255,${1 - fade * 0.45})`;
        const inset = isHead ? 1 : isTail ? 4 : 2;
        const radius = isHead ? 6 : isTail ? 8 : 5;
        ctx.fillStyle = color;
        roundRect(
          ctx,
          s.x * CELL + inset,
          s.y * CELL + inset,
          CELL - inset * 2,
          CELL - inset * 2,
          radius,
        );
        ctx.fill();
        if (isHead) {
          // Eyes — positioned in direction of travel
          const v = VEC[st.dir];
          const eyeOff = 4;
          const sideOff = 4;
          // Two eyes perpendicular to direction
          const perp = { x: -v.y, y: v.x };
          const e1x = cx + v.x * eyeOff + perp.x * sideOff;
          const e1y = cy + v.y * eyeOff + perp.y * sideOff;
          const e2x = cx + v.x * eyeOff - perp.x * sideOff;
          const e2y = cy + v.y * eyeOff - perp.y * sideOff;
          ctx.fillStyle = "white";
          ctx.beginPath();
          ctx.arc(e1x, e1y, 2.2, 0, Math.PI * 2);
          ctx.arc(e2x, e2y, 2.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#0b0d12";
          ctx.beginPath();
          ctx.arc(e1x + v.x * 0.7, e1y + v.y * 0.7, 1.1, 0, Math.PI * 2);
          ctx.arc(e2x + v.x * 0.7, e2y + v.y * 0.7, 1.1, 0, Math.PI * 2);
          ctx.fill();
          // Subtle tongue when head is in motion
          if (live && Math.floor(now / 220) % 4 === 0) {
            ctx.strokeStyle = "#ff5cae";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            const tipX = cx + v.x * (CELL / 2 + 4);
            const tipY = cy + v.y * (CELL / 2 + 4);
            ctx.moveTo(cx + v.x * (CELL / 2 - 1), cy + v.y * (CELL / 2 - 1));
            ctx.lineTo(tipX, tipY);
            ctx.stroke();
          }
        }
      });

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, paused, over, difficulty]);

  const best = bestByDiff[difficulty];

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#0a1f0d] to-[#0b0d12] p-2 sm:p-3">
      {/* HUD row 1 — stats */}
      <div className="shrink-0 flex items-center justify-center gap-2 mb-1.5 text-white text-xs sm:text-sm flex-wrap">
        <Stat label="Score" value={score} accent />
        <Stat label="Length" value={length} />
        <Stat label="Speed" value={`${hudSpeed.toFixed(1)}/s`} />
        <Stat label="Best" value={best} />
        <SoundToggle />
        {started && !over && (
          <PauseToggle paused={paused} onClick={togglePause} />
        )}
      </div>

      {/* HUD row 2 — difficulty */}
      <div className="shrink-0 flex items-center justify-center mb-2">
        <div className="inline-flex rounded-lg bg-white/10 p-0.5 text-[11px]">
          {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => (
            <button
              key={d}
              onClick={() => {
                setDifficulty(d);
                reset(d);
              }}
              className={`px-3 py-1 rounded-md font-bold capitalize transition-colors ${
                difficulty === d
                  ? "bg-white/20 text-white"
                  : "text-white/60 hover:text-white"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
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
            className="absolute inset-0 w-full h-full block rounded-xl border border-white/10"
          />
          {!started && !over && (
            <GameOverlay
              icon="🐍"
              title="Snake"
              subtitle={
                <>
                  Eat the pink dots to grow. Catch the gold ⭐ when it appears
                  for <b>+{BONUS_FOOD_PTS}</b>. Don&apos;t bite yourself.
                </>
              }
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
              icon="💀"
              title="Game over"
              subtitle={`Score: ${score} · Length: ${length}`}
              primary={{ label: "Play again", onClick: () => reset() }}
            >
              <ScoreStatus gameSlug="snake" status={submitStatus} />
            </GameOverlay>
          )}
        </div>
      </div>
      <div className="shrink-0 mt-2 text-[11px] text-white/60 text-center">
        Arrow keys / WASD · Swipe on mobile · <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono">P</kbd> pauses
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <span
      className={`px-3 py-1 rounded-lg ${
        accent
          ? "bg-[var(--accent)]/20 border border-[var(--accent)]/40"
          : "bg-white/10"
      }`}
    >
      <span className="text-[10px] uppercase tracking-wider opacity-60 mr-1.5">
        {label}
      </span>
      <b>{value}</b>
    </span>
  );
}

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
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}
