"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";
import { GameOverlay, PauseToggle } from "@/components/games/GameOverlay";
import { SoundToggle } from "@/components/SoundToggle";
import { Sfx } from "@/lib/sound";

const WORLD = 4200;
const VIEW_W = 960;
const VIEW_H = 600;
const FOOD_COUNT = 600;
const BOT_COUNT = 14;
const BASE_R = 28;
const FOOD_R = 5;
/** Radius ratio above which a bigger cell can eat a smaller one.
 *  Tuned slightly looser than agar.io's classic 25% mass advantage so
 *  the early game has clearer eat opportunities. */
const EAT_RATIO = 1.18;
/** Speed at base radius. Speed scales as sqrt(BASE_R / r), so a cell
 *  that is 4× the base radius moves at half-speed. */
const BASE_SPEED = 230;

type AI = { wanderUntil: number; tx: number; ty: number };
type Cell = {
  id: string;
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  hue: number;
  isPlayer: boolean;
  alive: boolean;
  ai?: AI;
};
type Food = { x: number; y: number; r: number; hue: number };

type State = {
  cells: Cell[];
  food: Food[];
  mouseScreen: { x: number; y: number };
  cameraX: number;
  cameraY: number;
  zoom: number;
  elapsed: number;
};

function rng(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function makeFood(): Food {
  return {
    x: rng(20, WORLD - 20),
    y: rng(20, WORLD - 20),
    r: FOOD_R + Math.random() * 2,
    hue: Math.random() * 360,
  };
}

function makeBot(i: number): Cell {
  return {
    id: `bot-${i}-${Math.random().toString(36).slice(2, 6)}`,
    x: rng(200, WORLD - 200),
    y: rng(200, WORLD - 200),
    r: BASE_R * (0.7 + Math.random() * 1.4),
    vx: 0,
    vy: 0,
    hue: (i * 37) % 360,
    isPlayer: false,
    alive: true,
    ai: { wanderUntil: 0, tx: 0, ty: 0 },
  };
}

export default function Agar() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [score, setScore] = useState(0);
  const [size, setSize] = useState(BASE_R);
  const [rank, setRank] = useState(BOT_COUNT + 1);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState(false);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const submitStatus = useSubmitScoreOnGameOver("agar-clone", score, over);

  const startedRef = useRef(false);
  startedRef.current = started;
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const overRef = useRef(false);
  overRef.current = over;

  const stateRef = useRef<State>({
    cells: [],
    food: [],
    mouseScreen: { x: VIEW_W / 2, y: VIEW_H / 2 - 80 },
    cameraX: WORLD / 2,
    cameraY: WORLD / 2,
    zoom: 1,
    elapsed: 0,
  });

  useEffect(() => {
    setBest(Number(localStorage.getItem("nexplay:agar-clone-best") || 0));
  }, []);

  const reset = useCallback(() => {
    const food: Food[] = Array.from({ length: FOOD_COUNT }, makeFood);
    const player: Cell = {
      id: "player",
      x: WORLD / 2,
      y: WORLD / 2,
      r: BASE_R,
      vx: 0,
      vy: 0,
      hue: 280,
      isPlayer: true,
      alive: true,
    };
    const bots = Array.from({ length: BOT_COUNT }, (_, i) => makeBot(i));
    stateRef.current = {
      cells: [player, ...bots],
      food,
      mouseScreen: { x: VIEW_W / 2, y: VIEW_H / 2 - 80 },
      cameraX: WORLD / 2,
      cameraY: WORLD / 2,
      zoom: 1,
      elapsed: 0,
    };
    setScore(0);
    setSize(BASE_R);
    setRank(BOT_COUNT + 1);
    setOver(false);
    setStarted(false);
    setPaused(false);
  }, []);

  const start = useCallback(() => {
    reset();
    setStarted(true);
  }, [reset]);

  const togglePause = useCallback(() => {
    if (overRef.current || !startedRef.current) return;
    setPaused((p) => !p);
  }, []);

  useEffect(() => {
    reset();
  }, [reset]);

  // Pause hotkey
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener("keydown", onDown);
    return () => window.removeEventListener("keydown", onDown);
  }, [togglePause]);

  // Mouse / touch input — track the pointer in canvas space; the loop
  // reads it each frame to decide direction.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const setFromClient = (cx: number, cy: number) => {
      const rect = wrap.getBoundingClientRect();
      stateRef.current.mouseScreen = {
        x: ((cx - rect.left) / rect.width) * VIEW_W,
        y: ((cy - rect.top) / rect.height) * VIEW_H,
      };
    };
    const onMove = (e: MouseEvent) => setFromClient(e.clientX, e.clientY);
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      e.preventDefault();
      setFromClient(t.clientX, t.clientY);
    };
    wrap.addEventListener("mousemove", onMove);
    wrap.addEventListener("touchstart", onTouch, { passive: false });
    wrap.addEventListener("touchmove", onTouch, { passive: false });
    return () => {
      wrap.removeEventListener("mousemove", onMove);
      wrap.removeEventListener("touchstart", onTouch);
      wrap.removeEventListener("touchmove", onTouch);
    };
  }, []);

  // Main loop
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      const live =
        startedRef.current && !pausedRef.current && !overRef.current;
      const player = st.cells.find((c) => c.isPlayer);

      if (live && player && player.alive) {
        st.elapsed += dt;

        // --- Player input → velocity ---
        const screenPlayerX =
          (player.x - st.cameraX) * st.zoom + VIEW_W / 2;
        const screenPlayerY =
          (player.y - st.cameraY) * st.zoom + VIEW_H / 2;
        const dx = st.mouseScreen.x - screenPlayerX;
        const dy = st.mouseScreen.y - screenPlayerY;
        const dist = Math.hypot(dx, dy);
        const maxSpeed = BASE_SPEED * Math.sqrt(BASE_R / player.r);
        if (dist > 4) {
          const intensity = Math.min(1, dist / 220);
          player.vx = (dx / dist) * maxSpeed * intensity;
          player.vy = (dy / dist) * maxSpeed * intensity;
        } else {
          player.vx *= 0.85;
          player.vy *= 0.85;
        }

        // --- AI bots: flee bigger threats, chase prey, else wander ---
        for (const c of st.cells) {
          if (c.isPlayer || !c.alive || !c.ai) continue;
          let prey: { x: number; y: number; r: number } | null = null;
          let preyD = Infinity;
          let threat: Cell | null = null;
          let threatD = Infinity;
          for (const other of st.cells) {
            if (other === c || !other.alive) continue;
            const d2 =
              (c.x - other.x) * (c.x - other.x) +
              (c.y - other.y) * (c.y - other.y);
            if (other.r > c.r * EAT_RATIO && d2 < threatD && d2 < 600 * 600) {
              threat = other;
              threatD = d2;
            } else if (
              c.r > other.r * EAT_RATIO &&
              d2 < preyD &&
              d2 < 500 * 500
            ) {
              prey = other;
              preyD = d2;
            }
          }
          // Food is always prey if no threat, weighted close
          for (const f of st.food) {
            const d2 =
              (c.x - f.x) * (c.x - f.x) + (c.y - f.y) * (c.y - f.y);
            if (d2 < preyD && d2 < 380 * 380) {
              prey = f;
              preyD = d2;
            }
          }
          let tx = c.x;
          let ty = c.y;
          if (threat) {
            tx = c.x - (threat.x - c.x);
            ty = c.y - (threat.y - c.y);
          } else if (prey) {
            tx = prey.x;
            ty = prey.y;
          } else {
            if (now / 1000 > c.ai.wanderUntil) {
              c.ai.wanderUntil = now / 1000 + 2 + Math.random() * 3;
              c.ai.tx = rng(120, WORLD - 120);
              c.ai.ty = rng(120, WORLD - 120);
            }
            tx = c.ai.tx;
            ty = c.ai.ty;
          }
          const tdx = tx - c.x;
          const tdy = ty - c.y;
          const td = Math.hypot(tdx, tdy);
          const maxSpd = BASE_SPEED * 0.85 * Math.sqrt(BASE_R / c.r);
          if (td > 4) {
            c.vx = (tdx / td) * maxSpd;
            c.vy = (tdy / td) * maxSpd;
          }
        }

        // --- Move all cells; clamp to world ---
        for (const c of st.cells) {
          if (!c.alive) continue;
          c.x += c.vx * dt;
          c.y += c.vy * dt;
          c.x = Math.max(c.r, Math.min(WORLD - c.r, c.x));
          c.y = Math.max(c.r, Math.min(WORLD - c.r, c.y));
        }

        // --- Cells eat food ---
        for (const c of st.cells) {
          if (!c.alive) continue;
          for (let i = st.food.length - 1; i >= 0; i--) {
            const f = st.food[i];
            const d2 =
              (c.x - f.x) * (c.x - f.x) + (c.y - f.y) * (c.y - f.y);
            if (d2 < c.r * c.r) {
              st.food.splice(i, 1);
              // Mass conservation: r_new = sqrt(r1² + r2²)
              c.r = Math.sqrt(c.r * c.r + f.r * f.r);
              if (c.isPlayer) {
                setScore((s) => s + Math.round(f.r));
                Sfx.pickup();
              }
            }
          }
        }
        while (st.food.length < FOOD_COUNT) st.food.push(makeFood());

        // --- Cells eat cells ---
        for (let i = 0; i < st.cells.length; i++) {
          const a = st.cells[i];
          if (!a.alive) continue;
          for (let j = 0; j < st.cells.length; j++) {
            if (i === j) continue;
            const b = st.cells[j];
            if (!b.alive) continue;
            if (a.r <= b.r * EAT_RATIO) continue;
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            // a eats b once b's centre sits inside a, biased so the
            // bigger blob has to genuinely overrun the smaller one
            if (d < a.r - b.r * 0.6) {
              a.r = Math.sqrt(a.r * a.r + b.r * b.r);
              b.alive = false;
              if (a.isPlayer) {
                setScore((s) => s + Math.round(b.r * 5));
                Sfx.bigPickup();
              }
            }
          }
        }

        // --- Respawn dead bots so the arena stays populated ---
        let aliveBots = 0;
        for (const c of st.cells) if (!c.isPlayer && c.alive) aliveBots++;
        let spawnedThisFrame = 0;
        while (aliveBots < BOT_COUNT && spawnedThisFrame < 2) {
          // Spawn off-camera so a fresh bot doesn't pop in next to the
          // player and instantly get devoured (or devour them).
          let sx = 0;
          let sy = 0;
          for (let attempt = 0; attempt < 6; attempt++) {
            sx = rng(120, WORLD - 120);
            sy = rng(120, WORLD - 120);
            const d = Math.hypot(sx - st.cameraX, sy - st.cameraY);
            if (d > 700) break;
          }
          const fresh = makeBot(st.cells.length);
          fresh.x = sx;
          fresh.y = sy;
          st.cells.push(fresh);
          aliveBots++;
          spawnedThisFrame++;
        }

        // --- Camera + zoom ---
        const zoomTarget = Math.max(
          0.4,
          Math.min(1.15, Math.sqrt(BASE_R / player.r)),
        );
        const k = 1 - Math.exp(-dt * 6);
        st.zoom += (zoomTarget - st.zoom) * k;
        st.cameraX += (player.x - st.cameraX) * k;
        st.cameraY += (player.y - st.cameraY) * k;

        // --- HUD ---
        setSize(Math.round(player.r));
        const biggerCount = st.cells.filter(
          (c) => c.alive && c !== player && c.r > player.r,
        ).length;
        setRank(biggerCount + 1);

        // --- Game over ---
        if (!player.alive && !overRef.current) {
          setOver(true);
          Sfx.gameOver();
          setScore((finalScore) => {
            setBest((b) => {
              const nb = Math.max(b, finalScore);
              localStorage.setItem(
                "nexplay:agar-clone-best",
                String(nb),
              );
              return nb;
            });
            return finalScore;
          });
        }
      }

      // ---- DRAW ----
      ctx.fillStyle = "#0a0a18";
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);

      ctx.save();
      ctx.translate(VIEW_W / 2, VIEW_H / 2);
      ctx.scale(st.zoom, st.zoom);
      ctx.translate(-st.cameraX, -st.cameraY);

      const vw = VIEW_W / st.zoom;
      const vh = VIEW_H / st.zoom;
      const minX = st.cameraX - vw / 2 - 60;
      const maxX = st.cameraX + vw / 2 + 60;
      const minY = st.cameraY - vh / 2 - 60;
      const maxY = st.cameraY + vh / 2 + 60;

      // Soft radial backdrop inside the world
      const bg = ctx.createRadialGradient(
        WORLD / 2,
        WORLD / 2,
        WORLD * 0.2,
        WORLD / 2,
        WORLD / 2,
        WORLD * 0.7,
      );
      bg.addColorStop(0, "rgba(124,92,255,0.06)");
      bg.addColorStop(1, "rgba(0,0,0,0.4)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, WORLD, WORLD);

      // Grid (only the visible region, only inside the world)
      ctx.strokeStyle = "rgba(255,255,255,0.045)";
      ctx.lineWidth = 1 / st.zoom;
      const grid = 80;
      const gMinX = Math.max(0, minX);
      const gMaxX = Math.min(WORLD, maxX);
      const gMinY = Math.max(0, minY);
      const gMaxY = Math.min(WORLD, maxY);
      const sx = Math.floor(gMinX / grid) * grid;
      const sy = Math.floor(gMinY / grid) * grid;
      for (let x = sx; x <= gMaxX; x += grid) {
        ctx.beginPath();
        ctx.moveTo(x, gMinY);
        ctx.lineTo(x, gMaxY);
        ctx.stroke();
      }
      for (let y = sy; y <= gMaxY; y += grid) {
        ctx.beginPath();
        ctx.moveTo(gMinX, y);
        ctx.lineTo(gMaxX, y);
        ctx.stroke();
      }

      // World border
      ctx.strokeStyle = "rgba(255,92,174,0.55)";
      ctx.lineWidth = 4 / st.zoom;
      ctx.strokeRect(0, 0, WORLD, WORLD);

      // Food pellets
      for (const f of st.food) {
        if (f.x < minX || f.x > maxX || f.y < minY || f.y > maxY) continue;
        ctx.fillStyle = `hsl(${f.hue}, 85%, 62%)`;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Cells — sort by radius so smaller render under larger; that way
      // an eater sits on top of its prey at the moment of the bite.
      const visible = st.cells
        .filter(
          (c) =>
            c.alive &&
            c.x + c.r > minX &&
            c.x - c.r < maxX &&
            c.y + c.r > minY &&
            c.y - c.r < maxY,
        )
        .sort((a, b) => a.r - b.r);
      for (const c of visible) {
        // Body (radial gradient, light highlight at top-left)
        const grad = ctx.createRadialGradient(
          c.x - c.r * 0.25,
          c.y - c.r * 0.25,
          c.r * 0.1,
          c.x,
          c.y,
          c.r,
        );
        grad.addColorStop(0, `hsl(${c.hue}, 85%, 72%)`);
        grad.addColorStop(1, `hsl(${c.hue}, 75%, 42%)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        ctx.fill();
        // Outline — slightly thicker for the player so they can find
        // themselves on a busy screen.
        ctx.strokeStyle = c.isPlayer
          ? "rgba(255,255,255,0.85)"
          : `hsl(${c.hue}, 80%, 30%)`;
        ctx.lineWidth = (c.isPlayer ? 4 : 3) / st.zoom;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        ctx.stroke();
        // Name plate (only readable above some size)
        if (c.r >= 20) {
          const fontPx = Math.max(13, c.r * 0.42);
          ctx.font = `bold ${fontPx}px system-ui`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.shadowColor = "rgba(0,0,0,0.85)";
          ctx.shadowBlur = 4;
          ctx.fillStyle = "white";
          const name = c.isPlayer
            ? "You"
            : `Bot ${c.id.split("-")[1] ?? ""}`;
          ctx.fillText(name, c.x, c.y - fontPx * 0.1);
          ctx.shadowBlur = 0;
          // Mass under the name
          ctx.font = `bold ${fontPx * 0.65}px system-ui`;
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.fillText(String(Math.round(c.r * c.r)), c.x, c.y + fontPx * 0.7);
        }
      }

      ctx.restore();

      // ---- Minimap ----
      const mmW = 130;
      const mmH = 130;
      const mmX = VIEW_W - mmW - 10;
      const mmY = 10;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(mmX, mmY, mmW, mmH);
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.strokeRect(mmX + 0.5, mmY + 0.5, mmW - 1, mmH - 1);
      const ms = mmW / WORLD;
      // Camera frame
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 1;
      ctx.strokeRect(
        mmX + (st.cameraX - vw / 2) * ms,
        mmY + (st.cameraY - vh / 2) * ms,
        vw * ms,
        vh * ms,
      );
      for (const c of st.cells) {
        if (!c.alive) continue;
        ctx.fillStyle = c.isPlayer ? "#ff5cae" : `hsl(${c.hue}, 70%, 60%)`;
        const r = Math.max(1.6, c.r * ms);
        ctx.beginPath();
        ctx.arc(mmX + c.x * ms, mmY + c.y * ms, r, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // HUD wrapper
  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#0a0a18] to-[#0b0d12] p-2 sm:p-3">
      <div className="shrink-0 flex items-center justify-center gap-2 mb-2 text-white text-xs sm:text-sm flex-wrap">
        <Stat label="Score" value={score} accent />
        <Stat label="Size" value={size} />
        <Stat label="Rank" value={`#${rank}`} />
        <Stat label="Best" value={best} />
        <SoundToggle />
        {started && !over && (
          <PauseToggle paused={paused} onClick={togglePause} />
        )}
      </div>

      <div className="flex-1 min-h-0 w-full flex items-center justify-center">
        <div
          ref={wrapRef}
          className="relative h-full max-w-full touch-none"
          style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
        >
          <canvas
            ref={canvasRef}
            width={VIEW_W}
            height={VIEW_H}
            className="absolute inset-0 w-full h-full block rounded-xl border border-white/10 cursor-crosshair"
          />
          {!started && !over && (
            <GameOverlay
              icon="🟢"
              title="Agar"
              subtitle={
                <>
                  Steer with the mouse, eat smaller cells and pellets,
                  dodge anything bigger than you. The longer you live, the
                  bigger you grow — and the slower you move.
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
                  <kbd className="px-1.5 py-0.5 rounded bg-white/15 border border-white/25 text-white font-mono">
                    P
                  </kbd>{" "}
                  to resume
                </>
              }
              primary={{ label: "▶ Resume", onClick: () => setPaused(false) }}
            />
          )}
          {over && (
            <GameOverlay
              icon="💀"
              title="You got eaten"
              subtitle={`Size ${size} · Rank #${rank} · Score ${score}`}
              primary={{ label: "Play again", onClick: start }}
            >
              <ScoreStatus gameSlug="agar-clone" status={submitStatus} />
            </GameOverlay>
          )}
        </div>
      </div>
      <div className="shrink-0 mt-2 text-[11px] text-white/60 text-center">
        Mouse to steer · eat anything ~18% smaller than you ·{" "}
        <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono">P</kbd>{" "}
        pauses
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
