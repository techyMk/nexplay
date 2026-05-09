"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useKeyboard } from "../useGameLoop";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";

const W = 800;
const H = 540;

type Asteroid = { x: number; y: number; vx: number; vy: number; r: number };
type Bullet = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
};
type EnemyBullet = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
};
type UFO = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dirChange: number;
  fireCool: number;
};
type BonusKind = "score" | "rapid" | "shield";
type Bonus = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: BonusKind;
  life: number;
};
type Pop = { x: number; y: number; t: number; pts: number; combo?: number };

// Classic Asteroids scoring: bigger rocks are easier to hit so they're
// worth less. Three sizes, two splits.
const R_BIG = 30;
const R_MED = 18;
const R_SMALL = 10;
const PTS_BIG = 20;
const PTS_MED = 50;
const PTS_SMALL = 100;
const PTS_UFO = 250;
const PTS_BONUS = 200;
const SURVIVE_PER_SEC = 5;

const COMBO_WINDOW = 2.4; // seconds before combo resets
const COMBO_MAX_MULT = 5;

function pointsFor(r: number): number {
  if (r > 22) return PTS_BIG;
  if (r > 13) return PTS_MED;
  return PTS_SMALL;
}

function splitFor(r: number): number | null {
  if (r > 22) return R_MED;
  if (r > 13) return R_SMALL;
  return null;
}

function spawnAsteroids(count: number): Asteroid[] {
  return Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    let x = Math.random() * W;
    let y = Math.random() * H;
    if (Math.hypot(x - W / 2, y - H / 2) < 120) {
      x = (x + W / 2) % W;
      y = (y + H / 2) % H;
    }
    return {
      x,
      y,
      vx: Math.cos(angle) * (40 + Math.random() * 40),
      vy: Math.sin(angle) * (40 + Math.random() * 40),
      r: R_BIG,
    };
  });
}

/** Toroidal distance — wraps around the screen edges. */
function torusDist(ax: number, ay: number, bx: number, by: number): number {
  let dx = Math.abs(ax - bx);
  let dy = Math.abs(ay - by);
  if (dx > W / 2) dx = W - dx;
  if (dy > H / 2) dy = H - dy;
  return Math.sqrt(dx * dx + dy * dy);
}

const BONUS_COLOR: Record<BonusKind, string> = {
  score: "#facc15",
  rapid: "#ec4899",
  shield: "#22d3ee",
};
const BONUS_LETTER: Record<BonusKind, string> = {
  score: "$",
  rapid: "R",
  shield: "S",
};

export default function Asteroids() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keys = useKeyboard();
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [wave, setWave] = useState(1);
  const [over, setOver] = useState(false);
  const [paused, setPaused] = useState(false);
  const submitStatus = useSubmitScoreOnGameOver("asteroids", score, over);

  // Live mirrors of state so the tick can read latest values without
  // tearing the rAF loop down on every change.
  const scoreRef = useRef(0);
  scoreRef.current = score;
  const overRef = useRef(false);
  overRef.current = over;
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  const stateRef = useRef({
    px: W / 2,
    py: H / 2,
    pa: -Math.PI / 2,
    pvx: 0,
    pvy: 0,
    bullets: [] as Bullet[],
    asteroids: spawnAsteroids(5),
    pops: [] as Pop[],
    ufo: null as UFO | null,
    enemyBullets: [] as EnemyBullet[],
    bonuses: [] as Bonus[],
    fireCool: 0,
    invuln: 1.5,
    surviveAcc: 0,
    wave: 1,
    ufoSpawnIn: 18,
    rapidFireFor: 0,
    comboCount: 0,
    comboTimer: 0,
  });

  useEffect(
    () => setBest(Number(localStorage.getItem("nexplay:asteroids-best") || 0)),
    [],
  );

  const reset = useCallback(() => {
    stateRef.current = {
      px: W / 2,
      py: H / 2,
      pa: -Math.PI / 2,
      pvx: 0,
      pvy: 0,
      bullets: [],
      asteroids: spawnAsteroids(5),
      pops: [],
      ufo: null,
      enemyBullets: [],
      bonuses: [],
      fireCool: 0,
      invuln: 1.5,
      surviveAcc: 0,
      wave: 1,
      ufoSpawnIn: 18,
      rapidFireFor: 0,
      comboCount: 0,
      comboTimer: 0,
    };
    setScore(0);
    setWave(1);
    setOver(false);
    setPaused(false);
  }, []);

  const togglePause = useCallback(() => {
    if (overRef.current) return;
    setPaused((p) => !p);
  }, []);

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

  useEffect(() => {
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
      const live = !overRef.current && !pausedRef.current;

      let scoredThisFrame = 0;

      const registerHitPoints = (basePts: number, x: number, y: number) => {
        // Combo: each kill within COMBO_WINDOW of the previous bumps the
        // counter; multiplier scales with √count, capped.
        if (st.comboTimer > 0) st.comboCount += 1;
        else st.comboCount = 1;
        st.comboTimer = COMBO_WINDOW;
        const mult = Math.min(COMBO_MAX_MULT, 1 + Math.floor((st.comboCount - 1) / 2));
        const earned = basePts * mult;
        scoredThisFrame += earned;
        st.pops.push({ x, y, t: 0, pts: earned, combo: mult > 1 ? mult : undefined });
      };

      if (live) {
        if (st.invuln > 0) st.invuln -= dt;
        if (st.rapidFireFor > 0) st.rapidFireFor -= dt;
        if (st.comboTimer > 0) {
          st.comboTimer -= dt;
          if (st.comboTimer <= 0) st.comboCount = 0;
        }

        if (k.has("ArrowLeft") || k.has("a")) st.pa -= 4 * dt;
        if (k.has("ArrowRight") || k.has("d")) st.pa += 4 * dt;
        if (k.has("ArrowUp") || k.has("w")) {
          st.pvx += Math.cos(st.pa) * 280 * dt;
          st.pvy += Math.sin(st.pa) * 280 * dt;
        }
        st.pvx *= 0.99;
        st.pvy *= 0.99;
        st.px = wrap(st.px + st.pvx * dt, W);
        st.py = wrap(st.py + st.pvy * dt, H);

        st.fireCool -= dt;
        const fireDelay = st.rapidFireFor > 0 ? 0.07 : 0.18;
        if (k.has(" ") && st.fireCool <= 0) {
          st.bullets.push({
            x: st.px,
            y: st.py,
            vx: Math.cos(st.pa) * 480 + st.pvx,
            vy: Math.sin(st.pa) * 480 + st.pvy,
            life: 1.2,
          });
          st.fireCool = fireDelay;
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

        // ---- bullet vs asteroid ----
        const newAsts: Asteroid[] = [];
        const removeBullets: Set<Bullet> = new Set();
        for (const a of st.asteroids) {
          let hit = false;
          for (const b of st.bullets) {
            if (removeBullets.has(b)) continue;
            if (torusDist(a.x, a.y, b.x, b.y) < a.r) {
              hit = true;
              removeBullets.add(b);
              registerHitPoints(pointsFor(a.r), a.x, a.y);
              const child = splitFor(a.r);
              if (child !== null) {
                for (let i = 0; i < 2; i++) {
                  const angle = Math.random() * Math.PI * 2;
                  newAsts.push({
                    x: a.x,
                    y: a.y,
                    vx: Math.cos(angle) * 90,
                    vy: Math.sin(angle) * 90,
                    r: child,
                  });
                }
              }
              // Big-rock kills sometimes drop a bonus pickup
              if (a.r > 22 && Math.random() < 0.22) {
                const kinds: BonusKind[] = ["score", "rapid", "shield"];
                st.bonuses.push({
                  x: a.x,
                  y: a.y,
                  vx: (Math.random() - 0.5) * 40,
                  vy: 20 + Math.random() * 30,
                  kind: kinds[Math.floor(Math.random() * kinds.length)],
                  life: 9,
                });
              }
              break;
            }
          }
          if (!hit) newAsts.push(a);
        }
        st.asteroids = newAsts;
        st.bullets = st.bullets.filter((b) => !removeBullets.has(b));

        // ---- UFO ----
        st.ufoSpawnIn -= dt;
        if (st.ufoSpawnIn <= 0 && !st.ufo && st.wave >= 2) {
          const fromLeft = Math.random() < 0.5;
          st.ufo = {
            x: fromLeft ? -30 : W + 30,
            y: 60 + Math.random() * (H - 120),
            vx: fromLeft ? 90 : -90,
            vy: 0,
            dirChange: 1.4 + Math.random(),
            fireCool: 1.5,
          };
          st.ufoSpawnIn = 18 + Math.random() * 12;
        }
        if (st.ufo) {
          const u = st.ufo;
          u.x += u.vx * dt;
          u.y += u.vy * dt;
          u.y = Math.max(40, Math.min(H - 40, u.y));
          u.dirChange -= dt;
          if (u.dirChange <= 0) {
            u.vy = (Math.random() - 0.5) * 100;
            u.dirChange = 1.4 + Math.random();
          }
          u.fireCool -= dt;
          if (u.fireCool <= 0) {
            const dx = st.px - u.x;
            const dy = st.py - u.y;
            const len = Math.hypot(dx, dy) || 1;
            st.enemyBullets.push({
              x: u.x,
              y: u.y,
              vx: (dx / len) * 220 + (Math.random() - 0.5) * 30,
              vy: (dy / len) * 220 + (Math.random() - 0.5) * 30,
              life: 3,
            });
            u.fireCool = 1.6 + Math.random();
          }
          // Bullet vs UFO
          for (const b of st.bullets) {
            if (removeBullets.has(b)) continue;
            if (Math.hypot(u.x - b.x, u.y - b.y) < 16) {
              removeBullets.add(b);
              registerHitPoints(PTS_UFO, u.x, u.y);
              // Always drop a bonus on UFO kill
              const kinds: BonusKind[] = ["rapid", "shield"];
              st.bonuses.push({
                x: u.x,
                y: u.y,
                vx: 0,
                vy: 30,
                kind: kinds[Math.floor(Math.random() * kinds.length)],
                life: 9,
              });
              st.ufo = null;
              break;
            }
          }
          // Despawn off-screen
          if (st.ufo && (st.ufo.x < -60 || st.ufo.x > W + 60)) st.ufo = null;
          st.bullets = st.bullets.filter((b) => !removeBullets.has(b));
        }

        // ---- Enemy bullets move + collide with player ----
        for (const eb of st.enemyBullets) {
          eb.x = wrap(eb.x + eb.vx * dt, W);
          eb.y = wrap(eb.y + eb.vy * dt, H);
          eb.life -= dt;
        }
        st.enemyBullets = st.enemyBullets.filter((eb) => eb.life > 0);

        // ---- Bonuses ----
        for (const bo of st.bonuses) {
          bo.x = wrap(bo.x + bo.vx * dt, W);
          bo.y = wrap(bo.y + bo.vy * dt, H);
          bo.life -= dt;
          if (torusDist(bo.x, bo.y, st.px, st.py) < 22) {
            if (bo.kind === "score") {
              scoredThisFrame += PTS_BONUS;
              st.pops.push({ x: bo.x, y: bo.y, t: 0, pts: PTS_BONUS });
            } else if (bo.kind === "rapid") {
              st.rapidFireFor = 6;
            } else if (bo.kind === "shield") {
              st.invuln = Math.max(st.invuln, 4);
            }
            bo.life = 0;
          }
        }
        st.bonuses = st.bonuses.filter((b) => b.life > 0);

        // ---- Survival drip ----
        st.surviveAcc += SURVIVE_PER_SEC * dt;
        const surviveWhole = Math.floor(st.surviveAcc);
        if (surviveWhole > 0) {
          st.surviveAcc -= surviveWhole;
          scoredThisFrame += surviveWhole;
        }

        if (scoredThisFrame > 0) setScore((s) => s + scoredThisFrame);

        // ---- Ship vs asteroid / enemy bullets ----
        if (st.invuln <= 0) {
          let died = false;
          for (const a of st.asteroids) {
            if (torusDist(a.x, a.y, st.px, st.py) < a.r + 10) {
              died = true;
              break;
            }
          }
          if (!died) {
            for (const eb of st.enemyBullets) {
              if (torusDist(eb.x, eb.y, st.px, st.py) < 12) {
                died = true;
                break;
              }
            }
          }
          if (died) {
            setOver(true);
            const finalScore = scoreRef.current + scoredThisFrame;
            setBest((b) => {
              const nb = Math.max(b, finalScore);
              localStorage.setItem("nexplay:asteroids-best", String(nb));
              return nb;
            });
          }
        }

        // Wave clear
        if (st.asteroids.length === 0) {
          st.wave += 1;
          setWave(st.wave);
          st.asteroids = spawnAsteroids(4 + st.wave);
          st.invuln = 1.5;
        }

        // pops
        for (const p of st.pops) p.t += dt;
        st.pops = st.pops.filter((p) => p.t < 0.9);
      }

      // ----- DRAW -----
      ctx.fillStyle = "#0a0218";
      ctx.fillRect(0, 0, W, H);

      // stars
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      for (let i = 0; i < 60; i++) {
        const x = (i * 137) % W;
        const y = (i * 219) % H;
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
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // bonuses
      for (const bo of st.bonuses) {
        const pulse = 0.7 + 0.3 * Math.sin(now * 0.01);
        ctx.fillStyle = BONUS_COLOR[bo.kind];
        ctx.globalAlpha = bo.life < 2 ? Math.max(0, bo.life / 2) : 1;
        ctx.beginPath();
        ctx.arc(bo.x, bo.y, 12 * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#0a0218";
        ctx.font = "bold 14px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(BONUS_LETTER[bo.kind], bo.x, bo.y + 1);
        ctx.textBaseline = "alphabetic";
      }

      // bullets (player)
      ctx.fillStyle = "#facc15";
      for (const b of st.bullets) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // enemy bullets — bigger, red
      ctx.fillStyle = "#ef4444";
      for (const eb of st.enemyBullets) {
        ctx.beginPath();
        ctx.arc(eb.x, eb.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // UFO
      if (st.ufo) {
        const u = st.ufo;
        ctx.save();
        ctx.translate(u.x, u.y);
        ctx.strokeStyle = "#22c55e";
        ctx.fillStyle = "rgba(34,197,94,0.18)";
        ctx.lineWidth = 2;
        // saucer body
        ctx.beginPath();
        ctx.ellipse(0, 0, 22, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // dome
        ctx.beginPath();
        ctx.arc(0, -4, 8, Math.PI, 0);
        ctx.stroke();
        // glow under
        ctx.fillStyle = "rgba(34,197,94,0.35)";
        ctx.beginPath();
        ctx.ellipse(0, 6, 12, 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // ship
      ctx.save();
      ctx.translate(st.px, st.py);
      ctx.rotate(st.pa);
      const shielded = st.invuln > 0.2;
      ctx.strokeStyle =
        shielded && Math.floor(st.invuln * 10) % 2 === 0
          ? "rgba(34,211,238,0.85)"
          : "#7c5cff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-10, 8);
      ctx.lineTo(-6, 0);
      ctx.lineTo(-10, -8);
      ctx.closePath();
      ctx.stroke();
      if ((k.has("ArrowUp") || k.has("w")) && live && Math.random() < 0.7) {
        ctx.strokeStyle = "#ff5cae";
        ctx.beginPath();
        ctx.moveTo(-6, 4);
        ctx.lineTo(-14, 0);
        ctx.lineTo(-6, -4);
        ctx.stroke();
      }
      ctx.restore();
      // shield ring
      if (shielded) {
        ctx.strokeStyle = `rgba(34,211,238,${0.3 + 0.2 * Math.sin(now * 0.01)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(st.px, st.py, 22, 0, Math.PI * 2);
        ctx.stroke();
      }

      // score popups
      for (const p of st.pops) {
        const a = 1 - p.t / 0.9;
        ctx.fillStyle = p.combo
          ? `rgba(236, 72, 153, ${a})`
          : `rgba(252, 204, 21, ${a})`;
        ctx.font = `bold ${p.combo ? 22 : 18}px system-ui`;
        ctx.textAlign = "center";
        ctx.fillText(
          p.combo ? `+${p.pts} ×${p.combo}` : `+${p.pts}`,
          p.x,
          p.y - 30 * p.t,
        );
      }

      // ---- HUD ----
      ctx.textAlign = "left";
      ctx.fillStyle = "white";
      ctx.font = "bold 22px system-ui";
      ctx.fillText(`${scoreRef.current}`, 14, 30);
      ctx.font = "bold 11px system-ui";
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillText("SCORE", 14, 44);

      // Combo + buff stack
      let hudY = 64;
      const mult = Math.min(
        COMBO_MAX_MULT,
        1 + Math.floor((st.comboCount - 1) / 2),
      );
      if (st.comboTimer > 0 && mult > 1) {
        const a = Math.min(1, st.comboTimer / 0.6);
        ctx.fillStyle = `rgba(236, 72, 153, ${a})`;
        ctx.font = "bold 16px system-ui";
        ctx.fillText(`COMBO ×${mult}`, 14, hudY);
        hudY += 18;
      }
      if (st.rapidFireFor > 0) {
        ctx.fillStyle = "rgba(236, 72, 153, 0.9)";
        ctx.font = "bold 12px system-ui";
        ctx.fillText(`RAPID ${st.rapidFireFor.toFixed(1)}s`, 14, hudY);
        hudY += 16;
      }
      if (shielded) {
        ctx.fillStyle = "rgba(34,211,238,0.9)";
        ctx.font = "bold 12px system-ui";
        ctx.fillText(`SHIELD ${st.invuln.toFixed(1)}s`, 14, hudY);
      }

      // top right: wave + best
      ctx.textAlign = "right";
      ctx.font = "bold 12px system-ui";
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText(`WAVE ${st.wave}  ·  BEST ${best}`, W - 14, 28);
      ctx.textAlign = "left";

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [keys, best]);

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#020118] to-[#0b0d12] p-2 sm:p-3">
      <div className="shrink-0 flex items-center justify-center gap-2 mb-2 text-white text-xs flex-wrap">
        <span>
          Best: <b>{best}</b> · Wave <b>{wave}</b> · Arrows/WASD · Space fires · P
          pauses · <span className="text-pink-300">$</span> score{" "}
          <span className="text-pink-300">R</span> rapid{" "}
          <span className="text-cyan-300">S</span> shield
        </span>
        {!over && (
          <button
            onClick={togglePause}
            className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 font-bold transition-colors"
          >
            {paused ? "▶ Resume" : "⏸ Pause"}
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0 w-full flex items-center justify-center">
        <div className="relative h-full max-w-full" style={{ aspectRatio: `${W} / ${H}` }}>
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="absolute inset-0 w-full h-full block rounded-xl border border-white/10"
          />
          {paused && !over && (
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
          {over && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded-xl gap-2">
              <div className="text-4xl font-black text-white">Game over</div>
              <div className="text-white/80">
                Score: {score} · Wave {wave}
              </div>
              <ScoreStatus gameSlug="asteroids" status={submitStatus} />
              <button onClick={reset} className="mt-2 px-6 py-3 rounded-lg bg-white text-black font-bold hover:scale-105 transition-transform">
                Play again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
