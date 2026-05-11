"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";
import { GameOverlay, PauseToggle } from "@/components/games/GameOverlay";
import { SoundToggle } from "@/components/SoundToggle";
import { Sfx, createAmbience, type Ambience } from "@/lib/sound";

const WORLD = 3000;
const VIEW_W = 960;
const VIEW_H = 600;

const TANK_R = 30;
const TURRET_L = 48;
const TURRET_W = 18;

const PLAYER_MAX_HP = 100;
const PLAYER_REGEN = 6; // hp per second once you've sat still for a moment
const PLAYER_SPEED = 220;
const PLAYER_FIRE_COOLDOWN = 0.32;

const BOT_MAX_HP = 70;
const BOT_SPEED = 170;
const BOT_FIRE_COOLDOWN = 0.65;
const BOT_TARGET_COUNT = 5;
const BOT_AGGRO_RANGE = 520;
const BOT_FLEE_HP_RATIO = 0.3;

const BULLET_SPEED = 620;
const BULLET_R = 6;
const PLAYER_BULLET_DAMAGE = 18;
const BOT_BULLET_DAMAGE = 12;
const BULLET_LIFE = 1.6;

const POLYGON_TARGET = 26;
const POLY_RAM_HURT = 12;

type PolygonKind = "square" | "triangle" | "pentagon";

type Polygon = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
  maxHp: number;
  rot: number;
  rotV: number;
  kind: PolygonKind;
  hue: number;
  xp: number;
  damage: number;
};

type Bullet = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  damage: number;
  ownerId: string;
  hue: number;
};

type AI = { wanderUntil: number; tx: number; ty: number };
type Tank = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  /** Where the barrel is pointing — lerps toward target each frame
   *  so a fast mouse flick reads as a smooth swing instead of a snap. */
  turretAngle: number;
  /** Where the body is facing — lerps toward velocity direction so
   *  the tank visibly rotates as you drive. Without this the body is
   *  a featureless circle and rotation doesn't read at all. */
  bodyAngle: number;
  fireCool: number;
  alive: boolean;
  isPlayer: boolean;
  hue: number;
  ai?: AI;
};

type State = {
  tanks: Tank[];
  polygons: Polygon[];
  bullets: Bullet[];
  mouseScreen: { x: number; y: number };
  keys: Set<string>;
  fireHeld: boolean;
  cameraX: number;
  cameraY: number;
  elapsed: number;
  /** Time since the player last took damage — gates HP regen so a
   *  player can't tank shots and instantly heal. */
  playerSafeFor: number;
  /** Brief red flash on the player when hit, decays toward 0. */
  playerHitFlash: number;
};

function rng(min: number, max: number) {
  return min + Math.random() * (max - min);
}

/** Shortest signed angular delta from `from` to `to` in [-π, π]. */
function shortestAngle(from: number, to: number) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function makePolygon(): Polygon {
  const roll = Math.random();
  let kind: PolygonKind;
  let r: number;
  let hp: number;
  let xp: number;
  let damage: number;
  let hue: number;
  if (roll < 0.7) {
    kind = "square";
    r = rng(20, 25);
    hp = 18;
    xp = 10;
    damage = 8;
    hue = 50; // yellow
  } else if (roll < 0.95) {
    kind = "triangle";
    r = rng(24, 30);
    hp = 32;
    xp = 25;
    damage = 12;
    hue = 0; // red
  } else {
    kind = "pentagon";
    r = rng(38, 46);
    hp = 110;
    xp = 130;
    damage = 18;
    hue = 230; // blue
  }
  return {
    id: Math.random().toString(36).slice(2),
    x: rng(80, WORLD - 80),
    y: rng(80, WORLD - 80),
    vx: rng(-12, 12),
    vy: rng(-12, 12),
    r,
    hp,
    maxHp: hp,
    rot: Math.random() * Math.PI * 2,
    rotV: rng(-0.6, 0.6),
    kind,
    hue,
    xp,
    damage,
  };
}

function makeBot(i: number): Tank {
  const angle = Math.random() * Math.PI * 2;
  return {
    id: `bot-${i}-${Math.random().toString(36).slice(2, 5)}`,
    x: rng(200, WORLD - 200),
    y: rng(200, WORLD - 200),
    vx: 0,
    vy: 0,
    hp: BOT_MAX_HP,
    maxHp: BOT_MAX_HP,
    turretAngle: angle,
    bodyAngle: angle,
    fireCool: rng(0, BOT_FIRE_COOLDOWN),
    alive: true,
    isPlayer: false,
    hue: 0, // red enemy tanks
    ai: { wanderUntil: 0, tx: 0, ty: 0 },
  };
}

export default function Diep() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [score, setScore] = useState(0);
  const [hp, setHp] = useState(PLAYER_MAX_HP);
  const [kills, setKills] = useState(0);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState(false);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const submitStatus = useSubmitScoreOnGameOver("diep", score, over);

  // Tank-arena rumble: low C-power-chord square wave, heavily filtered,
  // very slow modulation. Sits low in the mix so the bullet pops cut
  // through clearly.
  const ambienceRef = useRef<Ambience | null>(null);
  useEffect(() => {
    if (!started) return;
    if (ambienceRef.current) return;
    ambienceRef.current = createAmbience({
      notes: [65, 98, 131], // C2 G2 C3
      type: "square",
      volume: 0.02,
      filterFreq: 350,
      modDepth: 120,
      modSpeed: 0.08,
    });
    return () => {
      ambienceRef.current?.stop();
      ambienceRef.current = null;
    };
  }, [started]);

  const startedRef = useRef(false);
  startedRef.current = started;
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const overRef = useRef(false);
  overRef.current = over;

  const stateRef = useRef<State>({
    tanks: [],
    polygons: [],
    bullets: [],
    mouseScreen: { x: VIEW_W / 2, y: VIEW_H / 2 - 80 },
    keys: new Set(),
    fireHeld: false,
    cameraX: WORLD / 2,
    cameraY: WORLD / 2,
    elapsed: 0,
    playerSafeFor: 0,
    playerHitFlash: 0,
  });
  /** Mirror of HP that lives in a ref so we only call setHp when the
   *  rounded value actually changes — avoids a React re-render on
   *  every regen tick. */
  const hpRef = useRef(PLAYER_MAX_HP);

  useEffect(() => {
    setBest(Number(localStorage.getItem("nexplay:diep-best") || 0));
  }, []);

  const reset = useCallback(() => {
    const player: Tank = {
      id: "player",
      x: WORLD / 2,
      y: WORLD / 2,
      vx: 0,
      vy: 0,
      hp: PLAYER_MAX_HP,
      maxHp: PLAYER_MAX_HP,
      turretAngle: 0,
      bodyAngle: 0,
      fireCool: 0,
      alive: true,
      isPlayer: true,
      hue: 220, // blue player tank
    };
    const bots = Array.from({ length: BOT_TARGET_COUNT }, (_, i) =>
      makeBot(i),
    );
    const polygons = Array.from({ length: POLYGON_TARGET }, () =>
      makePolygon(),
    );
    stateRef.current = {
      tanks: [player, ...bots],
      polygons,
      bullets: [],
      mouseScreen: { x: VIEW_W / 2, y: VIEW_H / 2 - 80 },
      keys: new Set(),
      fireHeld: false,
      cameraX: WORLD / 2,
      cameraY: WORLD / 2,
      elapsed: 0,
      playerSafeFor: 0,
      playerHitFlash: 0,
    };
    setScore(0);
    setHp(PLAYER_MAX_HP);
    setKills(0);
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

  // Keyboard — WASD/arrows for movement, space to fire, P to pause
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        e.preventDefault();
        togglePause();
        return;
      }
      const k = e.key.toLowerCase();
      if (
        ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(
          k,
        )
      ) {
        e.preventDefault();
      }
      stateRef.current.keys.add(k);
      if (k === " ") stateRef.current.fireHeld = true;
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      stateRef.current.keys.delete(k);
      if (k === " ") stateRef.current.fireHeld = false;
    };
    const onBlur = () => {
      stateRef.current.keys.clear();
      stateRef.current.fireHeld = false;
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [togglePause]);

  // Mouse — aim turret + click-to-fire (also touch)
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
    const onMouseDown = () => {
      stateRef.current.fireHeld = true;
    };
    const onMouseUp = () => {
      stateRef.current.fireHeld = false;
    };
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      e.preventDefault();
      setFromClient(t.clientX, t.clientY);
      stateRef.current.fireHeld = true;
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      e.preventDefault();
      setFromClient(t.clientX, t.clientY);
    };
    const onTouchEnd = () => {
      stateRef.current.fireHeld = false;
    };
    wrap.addEventListener("mousemove", onMove);
    wrap.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    wrap.addEventListener("touchstart", onTouchStart, { passive: false });
    wrap.addEventListener("touchmove", onTouchMove, { passive: false });
    wrap.addEventListener("touchend", onTouchEnd);
    return () => {
      wrap.removeEventListener("mousemove", onMove);
      wrap.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      wrap.removeEventListener("touchstart", onTouchStart);
      wrap.removeEventListener("touchmove", onTouchMove);
      wrap.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  // Main loop
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();

    const fireBullet = (
      st: State,
      tank: Tank,
      damage: number,
      hue: number,
    ) => {
      const muzzleX = tank.x + Math.cos(tank.turretAngle) * (TURRET_L + 4);
      const muzzleY = tank.y + Math.sin(tank.turretAngle) * (TURRET_L + 4);
      st.bullets.push({
        x: muzzleX,
        y: muzzleY,
        vx: Math.cos(tank.turretAngle) * BULLET_SPEED,
        vy: Math.sin(tank.turretAngle) * BULLET_SPEED,
        life: BULLET_LIFE,
        damage,
        ownerId: tank.id,
        hue,
      });
    };

    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      const live =
        startedRef.current && !pausedRef.current && !overRef.current;
      const player = st.tanks.find((t) => t.isPlayer)!;

      if (live && player.alive) {
        st.elapsed += dt;
        st.playerSafeFor += dt;
        if (st.playerHitFlash > 0) {
          st.playerHitFlash = Math.max(0, st.playerHitFlash - dt * 4);
        }

        // --- Player input → target velocity ---
        const k = st.keys;
        let mx = 0;
        let my = 0;
        if (k.has("a") || k.has("arrowleft")) mx -= 1;
        if (k.has("d") || k.has("arrowright")) mx += 1;
        if (k.has("w") || k.has("arrowup")) my -= 1;
        if (k.has("s") || k.has("arrowdown")) my += 1;
        const mlen = Math.hypot(mx, my);
        if (mlen > 0) {
          mx /= mlen;
          my /= mlen;
        }
        // Smooth velocity toward the target. Acceleration time
        // constant ~140ms — fast enough to feel responsive, slow
        // enough that recoil and direction changes have weight.
        const targetVx = mx * PLAYER_SPEED;
        const targetVy = my * PLAYER_SPEED;
        const accelK = 1 - Math.exp(-dt * 7);
        player.vx += (targetVx - player.vx) * accelK;
        player.vy += (targetVy - player.vy) * accelK;

        // --- Body angle slowly turns to match velocity direction ---
        // Without this the body is a featureless disc, so even though
        // the turret is rotating the tank doesn't *look* like it's
        // rotating. With body+arrow indicator the rotation reads.
        const moveSpeed = Math.hypot(player.vx, player.vy);
        if (moveSpeed > 30) {
          const targetBody = Math.atan2(player.vy, player.vx);
          const bdiff = shortestAngle(player.bodyAngle, targetBody);
          const maxBodyTurn = 7 * dt;
          player.bodyAngle += Math.max(-maxBodyTurn, Math.min(maxBodyTurn, bdiff));
        }

        // --- Turret aim with light smoothing ---
        // Kept fast (≈18 rad/s) so it still tracks the mouse well; the
        // tiny lag covers the rare frame where mouseScreen hasn't
        // updated yet and removes the "snap" that read as static.
        const screenPlayerX = player.x - st.cameraX + VIEW_W / 2;
        const screenPlayerY = player.y - st.cameraY + VIEW_H / 2;
        const targetTurret = Math.atan2(
          st.mouseScreen.y - screenPlayerY,
          st.mouseScreen.x - screenPlayerX,
        );
        const tdiff = shortestAngle(player.turretAngle, targetTurret);
        const maxTurretTurn = 18 * dt;
        player.turretAngle += Math.max(
          -maxTurretTurn,
          Math.min(maxTurretTurn, tdiff),
        );

        // --- Player fire ---
        player.fireCool -= dt;
        if (st.fireHeld && player.fireCool <= 0) {
          fireBullet(st, player, PLAYER_BULLET_DAMAGE, 200);
          player.fireCool = PLAYER_FIRE_COOLDOWN;
          // Recoil — adds to velocity. Now that we *lerp* velocity
          // instead of overwriting it, this kick lingers for a few
          // frames and feels like a real shove.
          player.vx -= Math.cos(player.turretAngle) * 110;
          player.vy -= Math.sin(player.turretAngle) * 110;
          Sfx.shoot();
        }

        // --- HP regen (only if you've not been hit recently) ---
        if (player.hp < PLAYER_MAX_HP && st.playerSafeFor > 2.5) {
          player.hp = Math.min(
            PLAYER_MAX_HP,
            player.hp + PLAYER_REGEN * dt,
          );
        }

        // --- AI tanks: pick a target and behave ---
        for (const t of st.tanks) {
          if (t.isPlayer || !t.alive || !t.ai) continue;
          // Pick target: player if in range, else nearest polygon to chip
          const dToPlayer = Math.hypot(t.x - player.x, t.y - player.y);
          const lowHp = t.hp / t.maxHp < BOT_FLEE_HP_RATIO;

          let tx = t.x;
          let ty = t.y;
          let aim: { x: number; y: number } | null = null;

          if (lowHp && dToPlayer < BOT_AGGRO_RANGE) {
            // Flee away from player
            const ang = Math.atan2(t.y - player.y, t.x - player.x);
            tx = t.x + Math.cos(ang) * 220;
            ty = t.y + Math.sin(ang) * 220;
            aim = { x: player.x, y: player.y };
          } else if (
            dToPlayer < BOT_AGGRO_RANGE &&
            player.alive
          ) {
            // Engage player at standoff distance
            const ang = Math.atan2(t.y - player.y, t.x - player.x);
            const standoff = 320;
            tx = player.x + Math.cos(ang) * standoff;
            ty = player.y + Math.sin(ang) * standoff;
            aim = { x: player.x, y: player.y };
          } else {
            // Find nearest polygon to chip for XP-pretend (lets bots
            // feel "alive" and not just camped near spawn)
            let nearest: Polygon | null = null;
            let nd = Infinity;
            for (const p of st.polygons) {
              const d2 =
                (p.x - t.x) * (p.x - t.x) + (p.y - t.y) * (p.y - t.y);
              if (d2 < nd) {
                nd = d2;
                nearest = p;
              }
            }
            if (nearest) {
              tx = nearest.x;
              ty = nearest.y;
              if (nd < 360 * 360) aim = { x: nearest.x, y: nearest.y };
            } else {
              // Wander
              if (now / 1000 > t.ai.wanderUntil) {
                t.ai.wanderUntil = now / 1000 + 2.5 + Math.random() * 2;
                t.ai.tx = rng(120, WORLD - 120);
                t.ai.ty = rng(120, WORLD - 120);
              }
              tx = t.ai.tx;
              ty = t.ai.ty;
            }
          }

          const tdx = tx - t.x;
          const tdy = ty - t.y;
          const td = Math.hypot(tdx, tdy);
          // Lerp toward target velocity (same model as the player)
          const desiredVx = td > 6 ? (tdx / td) * BOT_SPEED : 0;
          const desiredVy = td > 6 ? (tdy / td) * BOT_SPEED : 0;
          const botAccel = 1 - Math.exp(-dt * 5);
          t.vx += (desiredVx - t.vx) * botAccel;
          t.vy += (desiredVy - t.vy) * botAccel;
          // Body rotates toward velocity
          const sp = Math.hypot(t.vx, t.vy);
          if (sp > 25) {
            const targetBody = Math.atan2(t.vy, t.vx);
            const bdiff = shortestAngle(t.bodyAngle, targetBody);
            const maxBodyTurn = 5 * dt;
            t.bodyAngle += Math.max(-maxBodyTurn, Math.min(maxBodyTurn, bdiff));
          }
          // Turret aim — lerp at a slower rate than the player's so a
          // good dodger can sidestep their tracking.
          const targetTurret = aim
            ? Math.atan2(aim.y - t.y, aim.x - t.x)
            : Math.atan2(t.vy, t.vx);
          const turretDiff = shortestAngle(t.turretAngle, targetTurret);
          const maxBotTurret = 7 * dt;
          t.turretAngle += Math.max(
            -maxBotTurret,
            Math.min(maxBotTurret, turretDiff),
          );
          // Fire (only when turret is roughly on target)
          t.fireCool -= dt;
          if (aim && t.fireCool <= 0 && Math.abs(turretDiff) < 0.35) {
            fireBullet(st, t, BOT_BULLET_DAMAGE, 0);
            t.fireCool = BOT_FIRE_COOLDOWN;
          }
        }

        // --- Move tanks ---
        for (const t of st.tanks) {
          if (!t.alive) continue;
          t.x += t.vx * dt;
          t.y += t.vy * dt;
          t.x = Math.max(TANK_R, Math.min(WORLD - TANK_R, t.x));
          t.y = Math.max(TANK_R, Math.min(WORLD - TANK_R, t.y));
        }

        // --- Move polygons; bounce off world bounds ---
        for (const p of st.polygons) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.rotV * dt;
          if (p.x < p.r) {
            p.x = p.r;
            p.vx = Math.abs(p.vx);
          }
          if (p.x > WORLD - p.r) {
            p.x = WORLD - p.r;
            p.vx = -Math.abs(p.vx);
          }
          if (p.y < p.r) {
            p.y = p.r;
            p.vy = Math.abs(p.vy);
          }
          if (p.y > WORLD - p.r) {
            p.y = WORLD - p.r;
            p.vy = -Math.abs(p.vy);
          }
        }

        // --- Move bullets ---
        for (let i = st.bullets.length - 1; i >= 0; i--) {
          const b = st.bullets[i];
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.life -= dt;
          if (
            b.life <= 0 ||
            b.x < -10 ||
            b.x > WORLD + 10 ||
            b.y < -10 ||
            b.y > WORLD + 10
          ) {
            st.bullets.splice(i, 1);
          }
        }

        // --- Bullet vs polygon ---
        for (let i = st.bullets.length - 1; i >= 0; i--) {
          const b = st.bullets[i];
          let hit = false;
          for (let j = st.polygons.length - 1; j >= 0; j--) {
            const p = st.polygons[j];
            const dx = b.x - p.x;
            const dy = b.y - p.y;
            if (dx * dx + dy * dy < (p.r + BULLET_R) * (p.r + BULLET_R)) {
              p.hp -= b.damage;
              hit = true;
              if (p.hp <= 0) {
                // Award XP only to the original shooter if it's known
                const owner = st.tanks.find((t) => t.id === b.ownerId);
                if (owner?.isPlayer) {
                  setScore((s) => s + p.xp);
                  Sfx.match();
                }
                st.polygons.splice(j, 1);
              } else {
                Sfx.hit();
              }
              break;
            }
          }
          if (hit) st.bullets.splice(i, 1);
        }

        // --- Bullet vs tank (don't hit your own bullets) ---
        for (let i = st.bullets.length - 1; i >= 0; i--) {
          const b = st.bullets[i];
          let consumed = false;
          for (const t of st.tanks) {
            if (!t.alive || t.id === b.ownerId) continue;
            const dx = b.x - t.x;
            const dy = b.y - t.y;
            if (dx * dx + dy * dy < (TANK_R + BULLET_R) * (TANK_R + BULLET_R)) {
              t.hp -= b.damage;
              consumed = true;
              if (t.isPlayer) {
                st.playerSafeFor = 0;
                st.playerHitFlash = 1;
                Sfx.hit();
              }
              if (t.hp <= 0 && t.alive) {
                t.alive = false;
                if (t.isPlayer) {
                  // Game over handled below
                } else {
                  // Bot died — credit player only if they fired the
                  // killing shot
                  const owner = st.tanks.find((s) => s.id === b.ownerId);
                  if (owner?.isPlayer) {
                    setScore((s) => s + 200);
                    setKills((k) => k + 1);
                    Sfx.bigPickup();
                  }
                }
              }
              break;
            }
          }
          if (consumed) st.bullets.splice(i, 1);
        }

        // --- Tank vs polygon: rams hurt both ---
        for (const t of st.tanks) {
          if (!t.alive) continue;
          for (let i = st.polygons.length - 1; i >= 0; i--) {
            const p = st.polygons[i];
            const dx = t.x - p.x;
            const dy = t.y - p.y;
            const md = TANK_R + p.r;
            if (dx * dx + dy * dy < md * md) {
              t.hp -= p.damage * dt; // damage scaled by frame time
              p.hp -= POLY_RAM_HURT * dt;
              // Push tank away
              const ang = Math.atan2(dy, dx);
              t.x += Math.cos(ang) * 1.2;
              t.y += Math.sin(ang) * 1.2;
              if (t.isPlayer) {
                st.playerSafeFor = 0;
                st.playerHitFlash = 0.6;
              }
              if (p.hp <= 0) {
                if (t.isPlayer) {
                  setScore((s) => s + p.xp);
                }
                st.polygons.splice(i, 1);
              }
              if (t.hp <= 0 && t.alive) {
                t.alive = false;
                if (!t.isPlayer) {
                  setScore((s) => s + 50);
                  setKills((k) => k + 1);
                }
              }
            }
          }
        }

        // --- Replenish polygons (off-camera if possible) ---
        let spawned = 0;
        while (st.polygons.length < POLYGON_TARGET && spawned < 2) {
          const p = makePolygon();
          for (let attempt = 0; attempt < 6; attempt++) {
            if (
              Math.hypot(p.x - st.cameraX, p.y - st.cameraY) > 600
            )
              break;
            p.x = rng(80, WORLD - 80);
            p.y = rng(80, WORLD - 80);
          }
          st.polygons.push(p);
          spawned++;
        }

        // --- Replenish bots off-camera ---
        let aliveBots = 0;
        for (const t of st.tanks) if (!t.isPlayer && t.alive) aliveBots++;
        if (aliveBots < BOT_TARGET_COUNT) {
          const fresh = makeBot(st.tanks.length);
          for (let attempt = 0; attempt < 8; attempt++) {
            if (
              Math.hypot(fresh.x - st.cameraX, fresh.y - st.cameraY) >
              700
            )
              break;
            fresh.x = rng(120, WORLD - 120);
            fresh.y = rng(120, WORLD - 120);
          }
          st.tanks.push(fresh);
        }

        // --- Camera follows player ---
        const k2 = 1 - Math.exp(-dt * 7);
        st.cameraX += (player.x - st.cameraX) * k2;
        st.cameraY += (player.y - st.cameraY) * k2;

        // HUD HP pull — only push to React state when the rounded
        // value changes, otherwise we'd schedule a render every
        // frame that regen ticks fractional HP up.
        const hpRounded = Math.max(0, Math.round(player.hp));
        if (hpRounded !== hpRef.current) {
          hpRef.current = hpRounded;
          setHp(hpRounded);
        }

        // --- Game over ---
        if (!player.alive && !overRef.current) {
          setOver(true);
          Sfx.gameOver();
          setScore((finalScore) => {
            setBest((b) => {
              const nb = Math.max(b, finalScore);
              localStorage.setItem("nexplay:diep-best", String(nb));
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
      ctx.translate(VIEW_W / 2 - st.cameraX, VIEW_H / 2 - st.cameraY);

      // Backdrop
      const bg = ctx.createRadialGradient(
        WORLD / 2,
        WORLD / 2,
        WORLD * 0.2,
        WORLD / 2,
        WORLD / 2,
        WORLD * 0.7,
      );
      bg.addColorStop(0, "rgba(58,200,240,0.05)");
      bg.addColorStop(1, "rgba(0,0,0,0.4)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, WORLD, WORLD);

      // Visible bounds for culling
      const minX = st.cameraX - VIEW_W / 2 - 60;
      const maxX = st.cameraX + VIEW_W / 2 + 60;
      const minY = st.cameraY - VIEW_H / 2 - 60;
      const maxY = st.cameraY + VIEW_H / 2 + 60;

      // Grid (visible region only)
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      const grid = 64;
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
      ctx.lineWidth = 4;
      ctx.strokeRect(0, 0, WORLD, WORLD);

      // Polygons
      for (const p of st.polygons) {
        if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) continue;
        drawPolygon(ctx, p);
      }

      // Bullets — short motion trail behind the head reads as smooth
      // travel even when fps dips. Cap trail at ~1 frame at 60Hz.
      for (const b of st.bullets) {
        if (b.x < minX || b.x > maxX || b.y < minY || b.y > maxY) continue;
        ctx.strokeStyle = `hsla(${b.hue}, 85%, 65%, 0.45)`;
        ctx.lineWidth = BULLET_R * 1.7;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(b.x - b.vx * 0.04, b.y - b.vy * 0.04);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.fillStyle = `hsl(${b.hue}, 85%, 62%)`;
        ctx.strokeStyle = `hsl(${b.hue}, 90%, 28%)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(b.x, b.y, BULLET_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Tanks (alive only)
      for (const t of st.tanks) {
        if (!t.alive) continue;
        if (t.x + TANK_R < minX || t.x - TANK_R > maxX) continue;
        if (t.y + TANK_R < minY || t.y - TANK_R > maxY) continue;
        drawTank(ctx, t, t.isPlayer ? st.playerHitFlash : 0);
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
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 1;
      ctx.strokeRect(
        mmX + (st.cameraX - VIEW_W / 2) * ms,
        mmY + (st.cameraY - VIEW_H / 2) * ms,
        VIEW_W * ms,
        VIEW_H * ms,
      );
      for (const p of st.polygons) {
        ctx.fillStyle = `hsl(${p.hue}, 70%, 60%)`;
        ctx.fillRect(mmX + p.x * ms - 1, mmY + p.y * ms - 1, 2, 2);
      }
      for (const t of st.tanks) {
        if (!t.alive) continue;
        ctx.fillStyle = t.isPlayer ? "#22d3ee" : "#ef4444";
        ctx.beginPath();
        ctx.arc(mmX + t.x * ms, mmY + t.y * ms, t.isPlayer ? 3 : 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // hp is intentionally read inside via `player.hp`; we don't want
    // to restart the rAF on every HP tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#0a0a18] to-[#0b0d12] p-2 sm:p-3">
      <div className="shrink-0 flex items-center justify-center gap-2 mb-2 text-white text-xs sm:text-sm flex-wrap">
        <Stat label="Score" value={score} accent />
        <HpStat hp={hp} max={PLAYER_MAX_HP} />
        <Stat label="Kills" value={kills} />
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
              icon="🚗"
              title="Diep"
              subtitle={
                <>
                  WASD to drive, mouse to aim, click or{" "}
                  <kbd className="px-1 py-0.5 rounded bg-white/15 border border-white/25 text-white font-mono">
                    Space
                  </kbd>{" "}
                  to fire. Pop polygons for score, take down red tanks for
                  big points. HP regens after a few seconds out of fire.
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
              icon="💥"
              title="Tank destroyed"
              subtitle={`Score ${score} · ${kills} kill${kills === 1 ? "" : "s"}`}
              primary={{ label: "Play again", onClick: start }}
            >
              <ScoreStatus gameSlug="diep" status={submitStatus} />
            </GameOverlay>
          )}
        </div>
      </div>
      <div className="shrink-0 mt-2 text-[11px] hidden sm:block text-white/60 text-center">
        <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono">WASD</kbd>{" "}
        drive · mouse aim ·{" "}
        <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono">click</kbd>
        /
        <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono">Space</kbd>{" "}
        fire ·{" "}
        <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono">P</kbd>{" "}
        pauses
      </div>
    </div>
  );
}

function drawPolygon(ctx: CanvasRenderingContext2D, p: Polygon) {
  const sides = p.kind === "triangle" ? 3 : p.kind === "square" ? 4 : 5;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
    const px = Math.cos(a) * p.r;
    const py = Math.sin(a) * p.r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const grad = ctx.createRadialGradient(0, 0, p.r * 0.1, 0, 0, p.r);
  grad.addColorStop(0, `hsl(${p.hue}, 75%, 65%)`);
  grad.addColorStop(1, `hsl(${p.hue}, 70%, 38%)`);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = `hsl(${p.hue}, 80%, 28%)`;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  // Damage bar (only when wounded)
  if (p.hp < p.maxHp) {
    const w = p.r * 1.8;
    const x = p.x - w / 2;
    const y = p.y + p.r + 6;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x, y, w, 4);
    ctx.fillStyle = `hsl(${p.hue}, 80%, 60%)`;
    ctx.fillRect(x, y, w * (p.hp / p.maxHp), 4);
  }
}

function drawTank(ctx: CanvasRenderingContext2D, t: Tank, hitFlash: number) {
  // Turret — drawn first so the body sits on top of the base.
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(t.turretAngle);
  ctx.fillStyle = "#5a6373";
  ctx.strokeStyle = "#2a3140";
  ctx.lineWidth = 2;
  ctx.fillRect(0, -TURRET_W / 2, TURRET_L, TURRET_W);
  ctx.strokeRect(0, -TURRET_W / 2, TURRET_L, TURRET_W);
  ctx.restore();

  // Body — rotated by bodyAngle so the tank visibly turns with
  // movement. The radial gradient + an inset front arrow + side
  // tread bars make the rotation read clearly even on a small
  // round chassis.
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(t.bodyAngle);
  const grad = ctx.createRadialGradient(
    -TANK_R * 0.3,
    -TANK_R * 0.3,
    TANK_R * 0.1,
    0,
    0,
    TANK_R,
  );
  grad.addColorStop(0, `hsl(${t.hue}, 80%, 70%)`);
  grad.addColorStop(1, `hsl(${t.hue}, 75%, 38%)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, TANK_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = t.isPlayer
    ? "rgba(255,255,255,0.85)"
    : `hsl(${t.hue}, 90%, 28%)`;
  ctx.lineWidth = t.isPlayer ? 4 : 3;
  ctx.stroke();
  // Side tread bars (perpendicular to body axis) — these obviously
  // rotate with the body so the turn is unmistakable.
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(-TANK_R * 0.55, -TANK_R - 2, TANK_R * 1.1, 6);
  ctx.fillRect(-TANK_R * 0.55, TANK_R - 4, TANK_R * 1.1, 6);
  // Front arrow indicator — sharper rotation cue
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.moveTo(TANK_R * 0.7, 0);
  ctx.lineTo(TANK_R * 0.2, -TANK_R * 0.35);
  ctx.lineTo(TANK_R * 0.2, TANK_R * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Hit-flash — quick red bloom around the body when the player
  // takes damage, so the hit reads regardless of HP-bar polling.
  if (hitFlash > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, hitFlash);
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(t.x, t.y, TANK_R + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // HP bar (always for player, only when wounded for bots)
  if (t.isPlayer || t.hp < t.maxHp) {
    const w = TANK_R * 1.8;
    const x = t.x - w / 2;
    const y = t.y + TANK_R + 10;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x, y, w, 5);
    const ratio = Math.max(0, t.hp / t.maxHp);
    ctx.fillStyle =
      ratio > 0.5 ? "#16a34a" : ratio > 0.25 ? "#f59e0b" : "#ef4444";
    ctx.fillRect(x, y, w * ratio, 5);
  }
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

function HpStat({ hp, max }: { hp: number; max: number }) {
  const ratio = Math.max(0, Math.min(1, hp / max));
  const colour =
    ratio > 0.5 ? "#16a34a" : ratio > 0.25 ? "#f59e0b" : "#ef4444";
  return (
    <span className="px-3 py-1 rounded-lg bg-white/10 inline-flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wider opacity-60">
        HP
      </span>
      <span className="relative w-20 h-2 rounded-full bg-white/15 overflow-hidden">
        <span
          className="absolute inset-y-0 left-0"
          style={{ width: `${ratio * 100}%`, background: colour }}
        />
      </span>
      <b className="tabular-nums w-8 text-right">{hp}</b>
    </span>
  );
}
