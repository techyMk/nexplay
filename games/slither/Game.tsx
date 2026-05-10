"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";
import { GameOverlay, PauseToggle } from "@/components/games/GameOverlay";
import { SoundToggle } from "@/components/SoundToggle";
import { Sfx } from "@/lib/sound";

// World dimensions (game space). Camera follows the player.
const WORLD = 2400;
const VIEW_W = 960;
const VIEW_H = 600;
const FOOD_COUNT = 220;
const BOT_COUNT = 8;
const BASE_SPEED = 130; // px/sec
const BOOST_SPEED = 220;
const TURN_RATE = 4.5; // rad/sec — how fast head can rotate
const PLAYER_HUE_BASE = 270;

/** Body radius scales with length so a long snake reads as chunky. */
function bodyRadiusFor(length: number): number {
  return 8 + Math.min(18, Math.sqrt(Math.max(1, length)) * 0.9);
}
/** Segment spacing tracks body radius so the body stays a continuous
 *  tube as the snake fattens. */
function segSpacingFor(bodyR: number): number {
  return Math.max(4, bodyR * 0.55);
}

type Vec = { x: number; y: number };
type Snake = {
  id: string;
  segs: Vec[]; // first = head, last = tail
  dir: number; // radians
  targetDir: number;
  speed: number;
  hue: number;
  alive: boolean;
  isPlayer: boolean;
  /** AI memory */
  ai?: { wanderUntil: number; targetX: number; targetY: number };
  kills: number;
};
type Food = {
  x: number;
  y: number;
  r: number;
  hue: number;
  /** "premium" food gives more growth + points and looks distinct. */
  premium: boolean;
  /** Random phase so pulses across the field aren't synced. */
  phase: number;
};

function rng(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function makeFood(): Food {
  const premium = Math.random() < 0.06;
  return {
    x: rng(20, WORLD - 20),
    y: rng(20, WORLD - 20),
    r: premium ? rng(14, 18) : rng(7, 10),
    hue: premium ? rng(40, 60) : Math.random() * 360,
    premium,
    phase: Math.random() * Math.PI * 2,
  };
}

function makeSnake(opts: {
  id: string;
  isPlayer: boolean;
  hue: number;
  startX: number;
  startY: number;
  startDir?: number;
}): Snake {
  const dir = opts.startDir ?? Math.random() * Math.PI * 2;
  const segs: Vec[] = [];
  const len = 12;
  const spacing = segSpacingFor(bodyRadiusFor(len));
  for (let i = 0; i < len; i++) {
    segs.push({
      x: opts.startX - Math.cos(dir) * spacing * i,
      y: opts.startY - Math.sin(dir) * spacing * i,
    });
  }
  return {
    id: opts.id,
    segs,
    dir,
    targetDir: dir,
    speed: BASE_SPEED,
    hue: opts.hue,
    alive: true,
    isPlayer: opts.isPlayer,
    kills: 0,
    ai: opts.isPlayer
      ? undefined
      : { wanderUntil: 0, targetX: opts.startX, targetY: opts.startY },
  };
}

function distSq(a: Vec, b: Vec) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function shortestAngle(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export default function Slither() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [score, setScore] = useState(0);
  const [length, setLength] = useState(12);
  const [lengthFlash, setLengthFlash] = useState(false);
  const [rank, setRank] = useState(BOT_COUNT + 1);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState(false);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const submitStatus = useSubmitScoreOnGameOver("slither", score, over);

  const prevLenRef = useRef(12);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRef = useRef(false);
  startedRef.current = started;
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const overRef = useRef(false);
  overRef.current = over;

  const stateRef = useRef<{
    snakes: Snake[];
    food: Food[];
    mouseScreen: Vec; // mouse position in screen (canvas) space
    boost: boolean;
    cameraX: number;
    cameraY: number;
    elapsed: number;
  }>({
    snakes: [],
    food: [],
    mouseScreen: { x: VIEW_W / 2, y: VIEW_H / 2 - 60 },
    boost: false,
    cameraX: WORLD / 2,
    cameraY: WORLD / 2,
    elapsed: 0,
  });

  useEffect(() => {
    setBest(Number(localStorage.getItem("nexplay:slither-best") || 0));
  }, []);

  const reset = useCallback(() => {
    const food: Food[] = Array.from({ length: FOOD_COUNT }, () => makeFood());
    const player = makeSnake({
      id: "player",
      isPlayer: true,
      hue: PLAYER_HUE_BASE,
      startX: WORLD / 2,
      startY: WORLD / 2,
    });
    const bots: Snake[] = Array.from({ length: BOT_COUNT }, (_, i) =>
      makeSnake({
        id: `bot-${i}`,
        isPlayer: false,
        hue: (i * 47) % 360,
        startX: rng(200, WORLD - 200),
        startY: rng(200, WORLD - 200),
      }),
    );
    stateRef.current = {
      snakes: [player, ...bots],
      food,
      mouseScreen: { x: VIEW_W / 2, y: VIEW_H / 2 - 60 },
      boost: false,
      cameraX: WORLD / 2,
      cameraY: WORLD / 2,
      elapsed: 0,
    };
    setScore(0);
    setLength(player.segs.length);
    prevLenRef.current = player.segs.length;
    if (flashTimerRef.current) {
      clearTimeout(flashTimerRef.current);
      flashTimerRef.current = null;
    }
    setLengthFlash(false);
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

  // Init on mount
  useEffect(() => {
    reset();
  }, [reset]);

  // Keyboard — pause + boost. Also clear boost on blur/visibility
  // change so alt-tab or focus loss can't leave it "stuck on" and
  // silently drain the snake's length.
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        e.preventDefault();
        togglePause();
        return;
      }
      if (e.key === " " || e.key === "Shift") {
        e.preventDefault();
        stateRef.current.boost = true;
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Shift") {
        stateRef.current.boost = false;
      }
    };
    const clearBoost = () => {
      stateRef.current.boost = false;
    };
    const onVis = () => {
      if (document.hidden) stateRef.current.boost = false;
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", clearBoost);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", clearBoost);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [togglePause]);

  // Mouse + touch — track relative to canvas
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const setFromClient = (clientX: number, clientY: number) => {
      const rect = wrap.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * VIEW_W;
      const y = ((clientY - rect.top) / rect.height) * VIEW_H;
      stateRef.current.mouseScreen = { x, y };
    };
    const onMove = (e: MouseEvent) => setFromClient(e.clientX, e.clientY);
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      e.preventDefault();
      setFromClient(t.clientX, t.clientY);
    };
    const onMouseDown = () => {
      stateRef.current.boost = true;
    };
    const onMouseUp = () => {
      stateRef.current.boost = false;
    };
    wrap.addEventListener("mousemove", onMove);
    wrap.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    wrap.addEventListener("touchstart", onTouch, { passive: false });
    wrap.addEventListener("touchmove", onTouch, { passive: false });
    wrap.addEventListener("touchend", onMouseUp);
    return () => {
      wrap.removeEventListener("mousemove", onMove);
      wrap.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      wrap.removeEventListener("touchstart", onTouch);
      wrap.removeEventListener("touchmove", onTouch);
      wrap.removeEventListener("touchend", onMouseUp);
    };
  }, []);

  // Main game loop
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      const live = startedRef.current && !pausedRef.current && !overRef.current;
      const player = st.snakes.find((s) => s.isPlayer);

      if (live && player && player.alive) {
        st.elapsed += dt;

        // --- Player input → target direction ---
        const head = player.segs[0];
        const screenHead = {
          x: head.x - st.cameraX + VIEW_W / 2,
          y: head.y - st.cameraY + VIEW_H / 2,
        };
        const dx = st.mouseScreen.x - screenHead.x;
        const dy = st.mouseScreen.y - screenHead.y;
        if (Math.hypot(dx, dy) > 4) {
          player.targetDir = Math.atan2(dy, dx);
        }
        // Boost is always available — it just stops costing length once
        // the snake gets short enough that further shrinkage would kill
        // it. This way Space works from frame 1.
        const wantsBoost = st.boost;
        player.speed = wantsBoost ? BOOST_SPEED : BASE_SPEED;

        // --- AI bots ---
        for (const s of st.snakes) {
          if (s.isPlayer || !s.alive || !s.ai) continue;
          const sHead = s.segs[0];
          // Re-target periodically
          if (now / 1000 > s.ai.wanderUntil) {
            s.ai.wanderUntil = now / 1000 + 1.2 + Math.random() * 1.4;
            // 60% wander, 40% chase nearest food
            if (Math.random() < 0.6) {
              s.ai.targetX = rng(80, WORLD - 80);
              s.ai.targetY = rng(80, WORLD - 80);
            } else {
              let best: Food | null = null;
              let bestD = Infinity;
              for (const f of st.food) {
                const d = distSq(sHead, f);
                if (d < bestD) {
                  bestD = d;
                  best = f;
                }
              }
              if (best) {
                s.ai.targetX = best.x;
                s.ai.targetY = best.y;
              }
            }
          }
          // Avoid walls — if heading toward edge, retarget toward centre
          if (
            sHead.x < 80 ||
            sHead.x > WORLD - 80 ||
            sHead.y < 80 ||
            sHead.y > WORLD - 80
          ) {
            s.ai.targetX = WORLD / 2 + rng(-200, 200);
            s.ai.targetY = WORLD / 2 + rng(-200, 200);
          }
          const tdx = s.ai.targetX - sHead.x;
          const tdy = s.ai.targetY - sHead.y;
          s.targetDir = Math.atan2(tdy, tdx);
          s.speed = BASE_SPEED * 0.85; // slightly slower than player
        }

        // --- Move all alive snakes ---
        for (const s of st.snakes) {
          if (!s.alive) continue;
          // Smooth turn toward targetDir at TURN_RATE
          const diff = shortestAngle(s.dir, s.targetDir);
          const maxTurn = TURN_RATE * dt;
          s.dir += Math.max(-maxTurn, Math.min(maxTurn, diff));
          const head = s.segs[0];
          const nx = head.x + Math.cos(s.dir) * s.speed * dt;
          const ny = head.y + Math.sin(s.dir) * s.speed * dt;
          // Move head: prepend new head, drop last segment if no growth
          s.segs.unshift({ x: nx, y: ny });
          // Shorten while boosting (cost) — only on player, and only
          // while the snake is long enough that one more pop won't kill
          // them. Below the floor, boost is "free" so the player can
          // always escape. Rate is per-frame; at 60fps 5% ≈ 3 segs/sec
          // — meaningful but recoverable from a single normal pellet
          // per second.
          if (s.isPlayer && wantsBoost && Math.random() < 0.05) {
            if (s.segs.length > 12) s.segs.pop();
          }
          s.segs.pop();
        }

        // --- Player vs world boundary ---
        const ph = player.segs[0];
        if (ph.x < 0 || ph.x > WORLD || ph.y < 0 || ph.y > WORLD) {
          killSnake(player, st);
        }

        // --- Bots vs world boundary (push them back) ---
        for (const s of st.snakes) {
          if (s.isPlayer || !s.alive) continue;
          const h = s.segs[0];
          if (h.x < 0 || h.x > WORLD || h.y < 0 || h.y > WORLD) {
            killSnake(s, st);
          }
        }

        // --- Food eating ---
        for (const s of st.snakes) {
          if (!s.alive) continue;
          const h = s.segs[0];
          // Pickup grows with the snake's head — bigger snake, bigger
          // mouth — and with the dot's own radius.
          const headR = bodyRadiusFor(s.segs.length);
          for (let i = st.food.length - 1; i >= 0; i--) {
            const f = st.food[i];
            const dx2 = f.x - h.x;
            const dy2 = f.y - h.y;
            const pickupR = headR + f.r + 2;
            if (dx2 * dx2 + dy2 * dy2 < pickupR * pickupR) {
              st.food.splice(i, 1);
              // Growth per food is meaningful — three segments per
              // normal pellet, seven per premium — so the snake
              // visibly stretches as you eat.
              const tail = s.segs[s.segs.length - 1];
              const grow = f.premium ? 7 : 3;
              for (let g = 0; g < grow; g++) s.segs.push({ ...tail });
              if (s.isPlayer) {
                const pts = f.premium ? 25 : Math.round(f.r * 2 + 1);
                setScore((sc) => sc + pts);
                if (f.premium) Sfx.bigPickup();
                else Sfx.pickup();
              }
            }
          }
        }

        // Replenish food
        while (st.food.length < FOOD_COUNT) st.food.push(makeFood());

        // --- Head-vs-body collision (scaled by both snakes' radii) ---
        for (const a of st.snakes) {
          if (!a.alive) continue;
          const ha = a.segs[0];
          const aR = bodyRadiusFor(a.segs.length);
          for (const b of st.snakes) {
            if (!b.alive) continue;
            const bR = bodyRadiusFor(b.segs.length);
            // collision threshold = sum of half-radii (both bodies are
            // tubes, so their effective collision radius is around their
            // body radius)
            const hit = (aR * 0.55 + bR * 0.55);
            const hitSq = hit * hit;
            // Skip own segments near the head (self-collision off near the head)
            const skipFront = a === b ? 8 : 0;
            for (let i = skipFront; i < b.segs.length; i++) {
              const seg = b.segs[i];
              const dx3 = seg.x - ha.x;
              const dy3 = seg.y - ha.y;
              if (dx3 * dx3 + dy3 * dy3 < hitSq) {
                killSnake(a, st);
                if (a !== b) b.kills += 1;
                break;
              }
            }
            if (!a.alive) break;
          }
        }

        // --- Camera lerp toward player head ---
        const target = player.alive ? player.segs[0] : null;
        if (target) {
          const k = 1 - Math.exp(-dt * 6);
          st.cameraX += (target.x - st.cameraX) * k;
          st.cameraY += (target.y - st.cameraY) * k;
        }

        // --- HUD updates ---
        if (player.alive) {
          const newLen = player.segs.length;
          if (newLen < prevLenRef.current) {
            setLengthFlash(true);
            if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
            flashTimerRef.current = setTimeout(() => setLengthFlash(false), 220);
          }
          prevLenRef.current = newLen;
          setLength(newLen);
          // Rank: count alive snakes longer than player + 1
          const lenP = newLen;
          const longerCount = st.snakes.filter(
            (s) => s.alive && s !== player && s.segs.length > lenP,
          ).length;
          setRank(longerCount + 1);
        }

        // --- Player death → game over ---
        if (!player.alive && !overRef.current) {
          setOver(true);
          Sfx.gameOver();
          setScore((finalScore) => {
            setBest((b) => {
              const nb = Math.max(b, finalScore);
              localStorage.setItem("nexplay:slither-best", String(nb));
              return nb;
            });
            return finalScore;
          });
        }
      }

      // ---- DRAW ----
      const cam = { x: st.cameraX, y: st.cameraY };
      ctx.fillStyle = "#0a0a18";
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);

      // World boundary
      ctx.save();
      ctx.translate(VIEW_W / 2 - cam.x, VIEW_H / 2 - cam.y);

      // Subtle radial vignette inside the world
      const grad = ctx.createRadialGradient(
        WORLD / 2,
        WORLD / 2,
        WORLD * 0.3,
        WORLD / 2,
        WORLD / 2,
        WORLD * 0.7,
      );
      grad.addColorStop(0, "rgba(124,92,255,0.05)");
      grad.addColorStop(1, "rgba(0,0,0,0.4)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, WORLD, WORLD);

      // Grid (only in visible region)
      const minGX = Math.max(0, cam.x - VIEW_W / 2 - 60);
      const maxGX = Math.min(WORLD, cam.x + VIEW_W / 2 + 60);
      const minGY = Math.max(0, cam.y - VIEW_H / 2 - 60);
      const maxGY = Math.min(WORLD, cam.y + VIEW_H / 2 + 60);
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 1;
      const gridStep = 80;
      const startX = Math.floor(minGX / gridStep) * gridStep;
      const startY = Math.floor(minGY / gridStep) * gridStep;
      for (let x = startX; x <= maxGX; x += gridStep) {
        ctx.beginPath();
        ctx.moveTo(x, minGY);
        ctx.lineTo(x, maxGY);
        ctx.stroke();
      }
      for (let y = startY; y <= maxGY; y += gridStep) {
        ctx.beginPath();
        ctx.moveTo(minGX, y);
        ctx.lineTo(maxGX, y);
        ctx.stroke();
      }

      // World border glow
      ctx.strokeStyle = "rgba(255,92,174,0.6)";
      ctx.lineWidth = 4;
      ctx.strokeRect(0, 0, WORLD, WORLD);
      ctx.shadowColor = "rgba(255,92,174,0.4)";
      ctx.shadowBlur = 12;
      ctx.strokeRect(0, 0, WORLD, WORLD);
      ctx.shadowBlur = 0;

      // Food — only those in view. Each dot is a radial gradient
      // (bright core → fading halo) with a mild pulse, so the field
      // reads as glowing pellets instead of flat circles.
      for (const f of st.food) {
        const margin = f.premium ? 28 : 14;
        if (
          f.x < minGX - margin ||
          f.x > maxGX + margin ||
          f.y < minGY - margin ||
          f.y > maxGY + margin
        )
          continue;
        const tw = 0.85 + 0.15 * Math.sin(now * 0.005 + f.phase);
        const baseR = f.r * tw;
        // Outer halo
        const haloR = baseR * (f.premium ? 3.6 : 2.6);
        const halo = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, haloR);
        halo.addColorStop(0, `hsla(${f.hue},95%,75%,${f.premium ? 0.55 : 0.35})`);
        halo.addColorStop(1, `hsla(${f.hue},95%,55%,0)`);
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(f.x, f.y, haloR, 0, Math.PI * 2);
        ctx.fill();
        // Body (radial: white-ish core → saturated rim)
        const body = ctx.createRadialGradient(
          f.x - baseR * 0.3,
          f.y - baseR * 0.3,
          baseR * 0.05,
          f.x,
          f.y,
          baseR,
        );
        body.addColorStop(0, `hsla(${f.hue},100%,90%,1)`);
        body.addColorStop(0.5, `hsla(${f.hue},95%,65%,1)`);
        body.addColorStop(1, `hsla(${f.hue},95%,45%,1)`);
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.arc(f.x, f.y, baseR, 0, Math.PI * 2);
        ctx.fill();
        // Specular dot, top-left
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.arc(
          f.x - baseR * 0.35,
          f.y - baseR * 0.35,
          baseR * 0.22,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        // Premium gets a slow rotating sparkle ring
        if (f.premium) {
          ctx.save();
          ctx.translate(f.x, f.y);
          ctx.rotate(now * 0.001 + f.phase);
          ctx.strokeStyle = `hsla(${f.hue},100%,80%,${0.5 + 0.3 * tw})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let k = 0; k < 5; k++) {
            const a = (k / 5) * Math.PI * 2;
            const inner = baseR * 1.3;
            const outer = baseR * 1.9;
            ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
            ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
          }
          ctx.stroke();
          ctx.restore();
        }
      }

      // Snakes
      for (const s of st.snakes) {
        if (!s.alive) continue;
        // Body radius scales with length (sqrt-based, so growth feels
        // earned but doesn't run away).
        const bodyR = bodyRadiusFor(s.segs.length);
        // Boost streak: pink trail off the tail so the player can see
        // when boost is actually firing (and therefore costing length).
        if (s.isPlayer && st.boost && s.segs.length > 12) {
          const tailCount = Math.min(10, s.segs.length - 1);
          for (let i = 1; i <= tailCount; i++) {
            const seg = s.segs[s.segs.length - i];
            if (!seg) continue;
            const t = i / tailCount;
            const r = bodyR * (1.3 - t * 0.4) * (1 + 0.1 * Math.sin(now * 0.03 + i));
            const halo = ctx.createRadialGradient(seg.x, seg.y, 0, seg.x, seg.y, r * 2.4);
            halo.addColorStop(0, `rgba(255,92,174,${0.55 * (1 - t)})`);
            halo.addColorStop(1, "rgba(255,92,174,0)");
            ctx.fillStyle = halo;
            ctx.beginPath();
            ctx.arc(seg.x, seg.y, r * 2.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        for (let i = s.segs.length - 1; i >= 0; i--) {
          const seg = s.segs[i];
          if (
            seg.x < minGX - 20 ||
            seg.x > maxGX + 20 ||
            seg.y < minGY - 20 ||
            seg.y > maxGY + 20
          )
            continue;
          const t = i / s.segs.length;
          const lightness = s.isPlayer ? 60 : 55;
          ctx.fillStyle = `hsl(${s.hue + i * 0.3},85%,${lightness - t * 6}%)`;
          ctx.beginPath();
          ctx.arc(seg.x, seg.y, bodyR, 0, Math.PI * 2);
          ctx.fill();
        }
        // Head + eyes
        const head = s.segs[0];
        if (
          head.x >= minGX - 20 &&
          head.x <= maxGX + 20 &&
          head.y >= minGY - 20 &&
          head.y <= maxGY + 20
        ) {
          // Outline
          ctx.fillStyle = `hsl(${s.hue},90%,70%)`;
          ctx.beginPath();
          ctx.arc(head.x, head.y, bodyR + 1, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `hsl(${s.hue},90%,55%)`;
          ctx.beginPath();
          ctx.arc(head.x, head.y, bodyR, 0, Math.PI * 2);
          ctx.fill();
          // Eyes
          const eyeOff = bodyR * 0.45;
          const sideOff = bodyR * 0.55;
          const perpX = -Math.sin(s.dir);
          const perpY = Math.cos(s.dir);
          const dirX = Math.cos(s.dir);
          const dirY = Math.sin(s.dir);
          const e1x = head.x + dirX * eyeOff + perpX * sideOff;
          const e1y = head.y + dirY * eyeOff + perpY * sideOff;
          const e2x = head.x + dirX * eyeOff - perpX * sideOff;
          const e2y = head.y + dirY * eyeOff - perpY * sideOff;
          ctx.fillStyle = "white";
          ctx.beginPath();
          ctx.arc(e1x, e1y, bodyR * 0.3, 0, Math.PI * 2);
          ctx.arc(e2x, e2y, bodyR * 0.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#0a0a18";
          ctx.beginPath();
          ctx.arc(e1x + dirX * 1.2, e1y + dirY * 1.2, bodyR * 0.16, 0, Math.PI * 2);
          ctx.arc(e2x + dirX * 1.2, e2y + dirY * 1.2, bodyR * 0.16, 0, Math.PI * 2);
          ctx.fill();
          // Name plate (bots only)
          if (!s.isPlayer) {
            ctx.fillStyle = "rgba(255,255,255,0.6)";
            ctx.font = "bold 10px system-ui";
            ctx.textAlign = "center";
            ctx.fillText(`Bot ${s.id.split("-")[1] ?? ""}`, head.x, head.y - bodyR - 6);
          }
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
      const mmScale = mmW / WORLD;
      // Camera frame on the minimap
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1;
      ctx.strokeRect(
        mmX + (cam.x - VIEW_W / 2) * mmScale,
        mmY + (cam.y - VIEW_H / 2) * mmScale,
        VIEW_W * mmScale,
        VIEW_H * mmScale,
      );
      for (const s of st.snakes) {
        if (!s.alive) continue;
        const head = s.segs[0];
        ctx.fillStyle = s.isPlayer
          ? "#7c5cff"
          : `hsl(${s.hue},80%,60%)`;
        const r = s.isPlayer ? 3 : 2;
        ctx.beginPath();
        ctx.arc(mmX + head.x * mmScale, mmY + head.y * mmScale, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Boost meter
      if (player && player.alive) {
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.fillRect(VIEW_W - mmW - 10, mmY + mmH + 8, mmW, 6);
        const ratio = Math.min(1, (player.segs.length - 14) / 60);
        ctx.fillStyle = st.boost
          ? "#ff5cae"
          : "rgba(255,92,174,0.6)";
        ctx.fillRect(VIEW_W - mmW - 10, mmY + mmH + 8, mmW * ratio, 6);
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
        <Stat label="Length" value={length} flash={lengthFlash} />
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
              icon="🐍"
              title="Slither"
              subtitle={
                <>
                  Steer with the mouse, eat dots to grow, dodge other snakes.
                  Hold <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono">Space</kbd>{" "}
                  or click to boost (costs length).
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
              title="You died"
              subtitle={`Length ${length} · Rank #${rank} · Score ${score}`}
              primary={{ label: "Play again", onClick: start }}
            >
              <ScoreStatus gameSlug="slither" status={submitStatus} />
            </GameOverlay>
          )}
        </div>
      </div>
      <div className="shrink-0 mt-2 text-[11px] text-white/60 text-center">
        Mouse to steer · <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono">Space</kbd>/click to boost · <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono">P</kbd> pauses
      </div>
    </div>
  );
}

function killSnake(s: Snake, st: { food: Food[] }) {
  if (!s.alive) return;
  s.alive = false;
  // Drop body as food pellets, every other segment to keep it
  // manageable. Death drops never count as premium — those have to
  // be earned from the natural spawn pool.
  for (let i = 0; i < s.segs.length; i += 2) {
    const seg = s.segs[i];
    st.food.push({
      x: seg.x + (Math.random() - 0.5) * 6,
      y: seg.y + (Math.random() - 0.5) * 6,
      r: 3 + Math.random() * 1.5,
      hue: s.hue + (Math.random() - 0.5) * 30,
      premium: false,
      phase: Math.random() * Math.PI * 2,
    });
  }
}

function Stat({
  label,
  value,
  accent = false,
  flash = false,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
  flash?: boolean;
}) {
  const bg = flash
    ? "bg-pink-500/30 border border-pink-400/60"
    : accent
      ? "bg-[var(--accent)]/20 border border-[var(--accent)]/40"
      : "bg-white/10";
  return (
    <span
      className={`px-3 py-1 rounded-lg transition-colors duration-150 ${bg}`}
    >
      <span className="text-[10px] uppercase tracking-wider opacity-60 mr-1.5">
        {label}
      </span>
      <b>{value}</b>
    </span>
  );
}
