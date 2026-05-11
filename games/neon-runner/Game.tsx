"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";
import { SoundToggle } from "@/components/SoundToggle";
import { Sfx, createAmbience, type Ambience } from "@/lib/sound";

const W = 900;
const H = 380;
const GROUND = H - 60;
const PLAYER_X = 110;
const PLAYER_R = 18;
const GRAVITY = 2000;
const JUMP = -740;
const FAST_FALL = 2400;

type Obstacle = {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: "spike" | "block" | "overhead";
};

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; hue: number };

export default function NeonRunner() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [phase, setPhase] = useState<"ready" | "play" | "over">("ready");
  const [paused, setPaused] = useState(false);
  const submitStatus = useSubmitScoreOnGameOver("neon-runner", score, phase === "over");

  // Cyberpunk driving pad — sustained F#-major7 sawtooth with brisk
  // filter movement so it feels propulsive. Mounts when the round
  // goes live and tears down when we leave the play phase (or unmount).
  const ambienceRef = useRef<Ambience | null>(null);
  useEffect(() => {
    if (phase !== "play") {
      ambienceRef.current?.stop();
      ambienceRef.current = null;
      return;
    }
    if (ambienceRef.current) return;
    ambienceRef.current = createAmbience({
      notes: [92, 110, 139, 165], // F#2 A2 C#3 E3
      type: "sawtooth",
      volume: 0.025,
      filterFreq: 800,
      modDepth: 280,
      modSpeed: 0.3,
    });
    return () => {
      ambienceRef.current?.stop();
      ambienceRef.current = null;
    };
  }, [phase]);

  const stateRef = useRef({
    y: GROUND - PLAYER_R,
    vy: 0,
    onGround: true,
    sliding: false,
    obstacles: [] as Obstacle[],
    spawnAt: 0,
    speed: 380,
    elapsed: 0,
    // Independent parallax layers, accumulated without modulo to keep
    // them smooth. The modulo happens at draw-time for each layer.
    farOffset: 0,
    midOffset: 0,
    nearOffset: 0,
    laneOffset: 0,
    particles: [] as Particle[],
    hue: 260, // accent purple
    flash: 0, // milestone flash
    lastMilestone: 0,
  });

  useEffect(() => {
    setBest(Number(localStorage.getItem("nexplay:runner-best") || 0));
  }, []);

  const reset = useCallback(() => {
    stateRef.current = {
      y: GROUND - PLAYER_R,
      vy: 0,
      onGround: true,
      sliding: false,
      obstacles: [],
      spawnAt: 0.8,
      speed: 380,
      elapsed: 0,
      farOffset: 0,
      midOffset: 0,
      nearOffset: 0,
      laneOffset: 0,
      particles: [],
      hue: 260,
      flash: 0,
      lastMilestone: 0,
    };
    setScore(0);
    setPhase("ready");
    setPaused(false);
  }, []);

  const togglePause = useCallback(() => {
    if (phase !== "play") return;
    setPaused((p) => !p);
  }, [phase]);

  const jump = useCallback(() => {
    if (phase === "ready") {
      setPhase("play");
      return;
    }
    if (phase === "over") return;
    if (paused) {
      setPaused(false);
      return;
    }
    const st = stateRef.current;
    if (st.onGround && !st.sliding) {
      st.vy = JUMP;
      st.onGround = false;
      Sfx.jump();
      // Dust particles
      for (let i = 0; i < 8; i++) {
        st.particles.push({
          x: PLAYER_X + (Math.random() - 0.5) * 16,
          y: GROUND,
          vx: (Math.random() - 0.5) * 80,
          vy: -50 - Math.random() * 100,
          life: 0,
          max: 0.4,
          hue: st.hue,
        });
      }
    }
  }, [phase, paused]);

  const setSliding = useCallback((on: boolean) => {
    const st = stateRef.current;
    if (on) {
      if (!st.onGround) {
        // Fast-fall in air
        st.vy = Math.max(st.vy, FAST_FALL * 0.4);
      }
      st.sliding = true;
    } else {
      st.sliding = false;
    }
  }, []);

  // Keyboard input
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
        e.preventDefault();
        jump();
      } else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
        e.preventDefault();
        setSliding(true);
      } else if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        e.preventDefault();
        togglePause();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
        setSliding(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [jump, setSliding, togglePause]);

  // Touch: tap top half = jump, hold bottom half = slide
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      if (!t) return;
      const rect = canvas.getBoundingClientRect();
      const yFrac = (t.clientY - rect.top) / rect.height;
      if (yFrac > 0.6) setSliding(true);
      else jump();
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      setSliding(false);
    };
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });
    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, [jump, setSliding]);

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
        st.elapsed += dt;
        st.speed = 380 + st.elapsed * 14;
        st.hue = (260 + st.elapsed * 50) % 360;
        st.flash = Math.max(0, st.flash - dt * 3);

        // Parallax
        st.farOffset += st.speed * 0.18 * dt;
        st.midOffset += st.speed * 0.45 * dt;
        st.nearOffset += st.speed * dt;
        st.laneOffset += st.speed * dt;

        // Apply extra gravity if fast-falling
        const grav = st.sliding && !st.onGround ? FAST_FALL : GRAVITY;
        st.vy += grav * dt;
        st.y += st.vy * dt;
        if (st.y >= GROUND - PLAYER_R) {
          st.y = GROUND - PLAYER_R;
          st.vy = 0;
          if (!st.onGround) {
            // Landing dust
            for (let i = 0; i < 6; i++) {
              st.particles.push({
                x: PLAYER_X + (Math.random() - 0.5) * 20,
                y: GROUND,
                vx: (Math.random() - 0.5) * 60,
                vy: -20 - Math.random() * 40,
                life: 0,
                max: 0.3,
                hue: st.hue,
              });
            }
          }
          st.onGround = true;
        }

        // Spawn obstacles
        st.spawnAt -= dt;
        if (st.spawnAt <= 0) {
          // Spacing tightens with speed but stays jumpable
          const baseGap = Math.max(0.45, 0.95 - st.elapsed * 0.012);
          st.spawnAt = baseGap + Math.random() * 0.4;

          const r = Math.random();
          // Early game: only ground obstacles. Introduce overheads gradually.
          const overheadChance = Math.min(0.3, st.elapsed / 60);
          if (r < overheadChance && st.elapsed > 8) {
            // Overhead bar — must slide
            st.obstacles.push({
              x: W + 40,
              y: GROUND - 70,
              w: 70,
              h: 22,
              kind: "overhead",
            });
          } else if (r < overheadChance + 0.45) {
            // Tall block
            const h = 30 + Math.random() * 38;
            st.obstacles.push({
              x: W + 40,
              y: GROUND - h,
              w: 30,
              h,
              kind: "block",
            });
          } else {
            // Spike
            st.obstacles.push({
              x: W + 40,
              y: GROUND - 28,
              w: 26,
              h: 28,
              kind: "spike",
            });
          }
        }

        for (const o of st.obstacles) o.x -= st.speed * dt;
        st.obstacles = st.obstacles.filter((o) => o.x + o.w > -20);

        // Speed-based "spark" particles trailing the player when on ground
        if (st.onGround && Math.random() < 0.35) {
          st.particles.push({
            x: PLAYER_X - PLAYER_R,
            y: GROUND - 1,
            vx: -st.speed * 0.6 - Math.random() * 60,
            vy: -10 - Math.random() * 20,
            life: 0,
            max: 0.25,
            hue: st.hue,
          });
        }

        // Update particles
        for (const p of st.particles) {
          p.life += dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 600 * dt;
        }
        st.particles = st.particles.filter((p) => p.life < p.max);

        // Collisions — hitbox depends on slide state
        const phP = st.sliding ? PLAYER_R * 0.6 : PLAYER_R * 2;
        const pyTop = st.sliding ? GROUND - PLAYER_R * 0.6 : st.y - PLAYER_R;
        const pyBot = pyTop + phP;
        const pxLeft = PLAYER_X - PLAYER_R * 0.85;
        const pxRight = PLAYER_X + PLAYER_R * 0.85;

        for (const o of st.obstacles) {
          if (
            pxRight > o.x + 2 &&
            pxLeft < o.x + o.w - 2 &&
            pyBot > o.y + 2 &&
            pyTop < o.y + o.h - 2
          ) {
            // Crash explosion
            for (let i = 0; i < 24; i++) {
              const a = Math.random() * Math.PI * 2;
              const sp = 100 + Math.random() * 250;
              st.particles.push({
                x: PLAYER_X,
                y: st.y,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp,
                life: 0,
                max: 0.6,
                hue: (st.hue + Math.random() * 60) % 360,
              });
            }
            setPhase("over");
            Sfx.gameOver();
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

        // ~ 1 point per pixel travelled, like classic endless runners.
        // At base speed (380) that's ~380/sec, ramping with the game.
        const gained = Math.round(st.speed * dt);
        if (gained > 0) {
          setScore((s) => {
            const ns = s + gained;
            // Milestone flash every 1,000 points
            const ms = Math.floor(ns / 1000);
            if (ms > st.lastMilestone) {
              st.flash = 1;
              st.lastMilestone = ms;
            }
            return ns;
          });
        }
      }

      // ---------------- DRAW ----------------
      // Background gradient — hue-shifted by elapsed for a slow color drift
      const bgHue1 = (260 + st.elapsed * 25) % 360;
      const bgHue2 = (300 + st.elapsed * 25) % 360;
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, `hsl(${bgHue1}, 60%, 12%)`);
      g.addColorStop(0.6, `hsl(${bgHue2}, 65%, 18%)`);
      g.addColorStop(1, "#0a0a18");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // Stars (static, twinkly)
      for (let i = 0; i < 30; i++) {
        const sx = (i * 137 + 17) % W;
        const sy = (i * 73 + 11) % (GROUND - 80);
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(now * 0.001 + i));
        ctx.fillStyle = `rgba(255,255,255,${tw * 0.5})`;
        ctx.fillRect(sx, sy, 2, 2);
      }

      // Far skyline (slowest)
      const farPeriod = 220;
      const farStart = -(((st.farOffset % farPeriod) + farPeriod) % farPeriod);
      ctx.fillStyle = `hsla(${(st.hue + 200) % 360}, 50%, 25%, 0.55)`;
      for (let x = farStart; x < W + farPeriod; x += farPeriod) {
        ctx.fillRect(x, GROUND - 130, 90, 130);
        ctx.fillRect(x + 110, GROUND - 100, 70, 100);
      }

      // Mid skyline
      const midPeriod = 170;
      const midStart = -(((st.midOffset % midPeriod) + midPeriod) % midPeriod);
      ctx.fillStyle = `hsla(${(st.hue + 220) % 360}, 70%, 30%, 0.7)`;
      for (let x = midStart; x < W + midPeriod; x += midPeriod) {
        ctx.fillRect(x, GROUND - 160, 60, 160);
        // Window glints
        ctx.fillStyle = `hsla(${(st.hue + 60) % 360}, 90%, 70%, 0.55)`;
        for (let wy = GROUND - 150; wy < GROUND - 20; wy += 18) {
          if (((wy + Math.floor(x)) | 0) % 2 === 0) ctx.fillRect(x + 8, wy, 6, 6);
          if (((wy + Math.floor(x)) | 0) % 3 === 0) ctx.fillRect(x + 30, wy, 6, 6);
        }
        ctx.fillStyle = `hsla(${(st.hue + 220) % 360}, 70%, 30%, 0.7)`;
      }

      // Ground
      ctx.fillStyle = "#08070f";
      ctx.fillRect(0, GROUND, W, H - GROUND);

      // Synthwave perspective grid below the ground line. Clipped to
      // the ground rectangle so no lines leak up into the sky/buildings.
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, GROUND, W, H - GROUND);
      ctx.clip();

      const groundH = H - GROUND;
      const vanishY = GROUND; // vanish at the horizon, no overshoot
      const gridHue = (st.hue + 40) % 360;
      ctx.lineWidth = 1;

      // Horizontal bands — phase-animated, ease-out spacing so far bands
      // cluster near the horizon and the front bands sweep toward you.
      ctx.strokeStyle = `hsla(${gridHue}, 95%, 65%, 1)`;
      const bandCount = 7;
      for (let i = 0; i < bandCount; i++) {
        const phase = ((st.laneOffset / 80 + i) % bandCount) / bandCount;
        const t = phase * phase;
        const y = GROUND + t * groundH;
        ctx.globalAlpha = 0.18 + (1 - t) * 0.45;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Vertical converging lines
      ctx.strokeStyle = `hsla(${gridHue}, 95%, 65%, 0.32)`;
      for (let i = -8; i <= 8; i++) {
        const xBottom = W / 2 + i * (W / 12);
        ctx.beginPath();
        ctx.moveTo(xBottom, H);
        ctx.lineTo(W / 2, vanishY);
        ctx.stroke();
      }
      ctx.restore();

      // Glowing horizon edge line — drawn LAST so it sits on top of
      // the perspective grid and reads as the actual ground.
      const lineGrad = ctx.createLinearGradient(0, GROUND - 2, 0, GROUND + 4);
      lineGrad.addColorStop(0, `hsla(${st.hue}, 90%, 60%, 0.0)`);
      lineGrad.addColorStop(0.5, `hsla(${st.hue}, 95%, 70%, 1)`);
      lineGrad.addColorStop(1, `hsla(${st.hue}, 90%, 60%, 0.0)`);
      ctx.fillStyle = lineGrad;
      ctx.fillRect(0, GROUND - 2, W, 6);

      // Particles
      for (const p of st.particles) {
        const a = 1 - p.life / p.max;
        ctx.fillStyle = `hsla(${p.hue}, 95%, 65%, ${a})`;
        ctx.fillRect(p.x - 1, p.y - 1, 3, 3);
      }

      // Obstacles
      for (const o of st.obstacles) {
        if (o.kind === "block") {
          const grad = ctx.createLinearGradient(o.x, o.y, o.x, o.y + o.h);
          grad.addColorStop(0, "#ff5cae");
          grad.addColorStop(1, "#a01957");
          ctx.fillStyle = grad;
          ctx.fillRect(o.x, o.y, o.w, o.h);
          ctx.fillStyle = "rgba(255,255,255,0.45)";
          ctx.fillRect(o.x + 4, o.y + 4, o.w - 8, 3);
        } else if (o.kind === "spike") {
          const grad = ctx.createLinearGradient(o.x, o.y, o.x, o.y + o.h);
          grad.addColorStop(0, "#fde68a");
          grad.addColorStop(1, "#facc15");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(o.x, o.y + o.h);
          ctx.lineTo(o.x + o.w / 2, o.y);
          ctx.lineTo(o.x + o.w, o.y + o.h);
          ctx.fill();
        } else {
          // Overhead bar
          const grad = ctx.createLinearGradient(o.x, o.y, o.x, o.y + o.h);
          grad.addColorStop(0, "#22d3ee");
          grad.addColorStop(1, "#0e7490");
          ctx.fillStyle = grad;
          ctx.fillRect(o.x, o.y, o.w, o.h);
          // Pillars connecting to ceiling
          ctx.fillStyle = "rgba(34,211,238,0.5)";
          ctx.fillRect(o.x, 0, 4, o.y);
          ctx.fillRect(o.x + o.w - 4, 0, 4, o.y);
          // "DUCK!" hint glow
          ctx.fillStyle = "rgba(34,211,238,0.18)";
          ctx.fillRect(o.x - 2, o.y - 6, o.w + 4, 4);
        }
      }

      // Player — clean circle (or flattened ellipse when sliding) with
      // a soft outer glow. Single solid fill for an unmistakable shape;
      // the highlight is a tiny centered dot, not an offset puddle.
      const px = PLAYER_X;
      const py = st.sliding ? GROUND - PLAYER_R * 0.5 : st.y;
      const rx = st.sliding ? PLAYER_R + 4 : PLAYER_R;
      const ry = st.sliding ? PLAYER_R * 0.5 : PLAYER_R;

      ctx.shadowColor = `hsl(${st.hue}, 95%, 60%)`;
      ctx.shadowBlur = 14;
      ctx.fillStyle = `hsl(${st.hue}, 90%, 58%)`;
      ctx.beginPath();
      ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Crisp inner ring so the silhouette reads as a clean shape
      ctx.strokeStyle = `hsla(${st.hue}, 100%, 80%, 0.9)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(px, py, rx - 1, ry - 1, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Small specular highlight, top-left, well inside the body
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.ellipse(
        px - rx * 0.35,
        py - ry * 0.4,
        rx * 0.22,
        ry * 0.22,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      // ---- HUD ----
      // Live score panel — center top
      const panelW = 200;
      const panelH = 56;
      const panelX = (W - panelW) / 2;
      const panelY = 14;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      // Rounded rect
      const rad = 12;
      ctx.moveTo(panelX + rad, panelY);
      ctx.lineTo(panelX + panelW - rad, panelY);
      ctx.quadraticCurveTo(panelX + panelW, panelY, panelX + panelW, panelY + rad);
      ctx.lineTo(panelX + panelW, panelY + panelH - rad);
      ctx.quadraticCurveTo(
        panelX + panelW,
        panelY + panelH,
        panelX + panelW - rad,
        panelY + panelH,
      );
      ctx.lineTo(panelX + rad, panelY + panelH);
      ctx.quadraticCurveTo(panelX, panelY + panelH, panelX, panelY + panelH - rad);
      ctx.lineTo(panelX, panelY + rad);
      ctx.quadraticCurveTo(panelX, panelY, panelX + rad, panelY);
      ctx.fill();

      // Flash on milestone
      if (st.flash > 0) {
        ctx.fillStyle = `hsla(${st.hue}, 95%, 65%, ${st.flash * 0.4})`;
        ctx.fill();
      }

      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "bold 9px system-ui";
      ctx.fillText("SCORE", W / 2, panelY + 14);
      ctx.fillStyle = "white";
      ctx.font = "bold 28px system-ui";
      ctx.fillText(`${score}`, W / 2, panelY + 42);
      ctx.textAlign = "start";

      // Speed indicator (bottom-left)
      const mult = st.speed / 380;
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "bold 10px system-ui";
      ctx.fillText(`SPEED ×${mult.toFixed(1)}`, 14, H - 14);

      // Best (top-right)
      ctx.textAlign = "end";
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "bold 12px system-ui";
      ctx.fillText(`BEST ${best}`, W - 14, 28);
      ctx.textAlign = "start";

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, paused, score, best]);

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#1a0a3e] to-[#0b0d12] p-2 sm:p-3">
      <div className="shrink-0 flex items-center justify-center gap-2 text-white text-[11px] sm:text-xs mb-2">
        <SoundToggle />
        <span className="opacity-80">
          <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono">Space</kbd>/<kbd className="px-1 py-0.5 rounded bg-white/10 font-mono">↑</kbd> jump · <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono">↓</kbd> slide · <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono">P</kbd> pause
        </span>
        {phase === "play" && (
          <button
            type="button"
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
            onClick={jump}
            className="absolute inset-0 w-full h-full block rounded-xl border border-white/10 cursor-pointer"
          />
          {phase === "play" && paused && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/65 backdrop-blur-sm rounded-xl">
              <div className="text-5xl mb-2">⏸</div>
              <div className="text-3xl font-black text-white mb-1">Paused</div>
              <div className="text-white/70 text-sm mb-4">
                Press <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono">P</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono">Space</kbd> to resume
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPaused(false);
                }}
                className="px-6 py-3 rounded-lg bg-white text-black font-bold hover:scale-105 transition-transform"
              >
                ▶ Resume
              </button>
            </div>
          )}

          {phase !== "play" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-xl pointer-events-none">
              {phase === "ready" ? (
                <>
                  <div className="text-3xl font-black text-white mb-2">Tap or press Space</div>
                  <div className="text-white/80 text-sm">to start running · ↓ slides under cyan bars</div>
                </>
              ) : (
                <>
                  <div className="text-4xl font-black text-white mb-2">Crashed!</div>
                  <div className="text-white/80 mb-2">Score: {score}</div>
                  <div className="pointer-events-auto mb-3">
                    <ScoreStatus gameSlug="neon-runner" status={submitStatus} />
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      reset();
                    }}
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
    </div>
  );
}
