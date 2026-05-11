"use client";

/**
 * Krunker — single-player vs bots FPS, our take on the genre.
 *
 * Architecture
 * ------------
 * Everything runs inside one rAF loop driven by a Three.js scene.
 * Player movement is yaw + pitch via PointerLock + a horizontal/
 * vertical velocity vector that integrates against gravity and
 * resolves AABB collisions against the static world geometry.
 *
 * Bots are dead simple state machines: PATROL (wander to random
 * waypoints) until line-of-sight to the player, then ENGAGE (close
 * to firing range, raycast-shoot every fireDelay seconds, strafe).
 * They share the same collision pipeline as the player so they
 * can't walk through walls.
 *
 * Hit detection on shooting is a single Raycaster cast from the
 * camera in the look direction (with optional spread). The first
 * hit decides what gets damaged — bot, wall, or nothing. Bullet
 * tracers are tiny line segments rendered for ~80 ms.
 *
 * The map is a single small arena: an outer wall ring + a handful
 * of interior boxes for cover. All collision shapes are AABBs.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GameOverlay } from "@/components/games/GameOverlay";
import { ScoreStatus } from "@/components/ScoreStatus";
import { SoundToggle } from "@/components/SoundToggle";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { Sfx } from "@/lib/sound";

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const MAP_HALF = 28;
const PLAYER_HEIGHT = 1.8;
const PLAYER_HEIGHT_CROUCH = 1.2;
const PLAYER_RADIUS = 0.4;
const PLAYER_SPEED = 6.5;
const SPRINT_MULT = 1.45;
const CROUCH_MULT = 0.55;
const ADS_MULT = 0.55;
const JUMP_VEL = 7.4;
const GRAVITY = 22;
const MOUSE_SENS = 0.0024;
const BASE_FOV = 78;
const SPRINT_FOV = 84;
const ADS_FOV = 58;
const SCOPE_FOV = 24;

const PLAYER_MAX_HP = 100;
const RESPAWN_DELAY = 1.5;
const ROUND_DURATION = 90; // seconds

// Bot AI tuning — these are deliberately conservative. The previous
// values (0.7s fire delay × 8 damage × 25% min hit chance) meant
// four bots could shred the player in <2s at close range. Tuned so
// the player can outplay a single bot but still gets pressured by
// a flanker.
const BOT_COUNT = 4;
const BOT_HP = 70;
const BOT_RADIUS = 0.5;
const BOT_HEIGHT = 1.7;
const BOT_SPEED = 3.6;
const BOT_VISION = 28;
const BOT_FIRE_DELAY = 1.05; // seconds between shots
const BOT_DAMAGE = 5;
/** One distinct colour per bot (hex), so the player can tell which
 *  Bot just took a hit from the kill feed / labels. Indexed by
 *  bot id (we have BOT_COUNT bots and reuse the list cyclically if
 *  more are added). */
const BOT_HUES = [0xef4444, 0xf97316, 0x22d3ee, 0xa855f7];

/** Spawn-protection duration: the player is invulnerable for this
 *  many milliseconds after respawning. Prevents a bot camping the
 *  spawn from instantly re-killing on the next life. */
const SPAWN_PROTECT_MS = 1500;

/** Y threshold above which a hit counts as a headshot. Bots are 1.7m
 *  tall with their feet at y=0; the head zone is the top 30% (y >= 1.19). */
const HEADSHOT_Y = BOT_HEIGHT * 0.7;
const HEADSHOT_MULT = 2;

type WeaponKind = "pistol" | "rifle" | "sniper";
type WeaponSpec = {
  name: string;
  kind: WeaponKind;
  damage: number;
  fireDelay: number; // seconds between shots
  hipSpread: number; // radians of cone when hip-firing
  adsSpread: number; // radians of cone when aiming down sights
  /** Recoil kick applied to camera pitch on each shot, in radians. */
  recoil: number;
  /** Random horizontal kick applied per shot. */
  recoilSide: number;
  magSize: number;
  reloadMs: number;
  auto: boolean;
  /** Sniper has an actual scope overlay. The other guns just narrow
   *  FOV when ADS-ing for a soft zoom. */
  hasScope: boolean;
  /** Used by the per-weapon sound dispatch. */
  soundKind: "click-snap" | "rifle-rip" | "sniper-boom";
};

const WEAPONS: Record<WeaponKind, WeaponSpec> = {
  pistol: {
    name: "Pistol",
    kind: "pistol",
    damage: 28,
    fireDelay: 0.24,
    hipSpread: 0.01,
    adsSpread: 0.0025,
    recoil: 0.014,
    recoilSide: 0.008,
    magSize: 12,
    reloadMs: 1000,
    auto: false,
    hasScope: false,
    soundKind: "click-snap",
  },
  rifle: {
    name: "Rifle",
    kind: "rifle",
    damage: 16,
    fireDelay: 0.09,
    hipSpread: 0.028,
    adsSpread: 0.009,
    recoil: 0.011,
    recoilSide: 0.009,
    magSize: 30,
    reloadMs: 1600,
    auto: true,
    hasScope: false,
    soundKind: "rifle-rip",
  },
  sniper: {
    name: "Sniper",
    kind: "sniper",
    damage: 90,
    fireDelay: 1.1,
    hipSpread: 0.16, // unusable from the hip — has to be scoped
    adsSpread: 0.001,
    recoil: 0.07,
    recoilSide: 0.012,
    magSize: 5,
    reloadMs: 2200,
    auto: false,
    hasScope: true,
    soundKind: "sniper-boom",
  },
};

const WEAPON_ORDER: WeaponKind[] = ["pistol", "rifle", "sniper"];

// ---------------------------------------------------------------------------
// AABB helpers — we use simple box colliders for everything, which keeps the
// player↔world resolution to three swept-axis passes per step.
// ---------------------------------------------------------------------------

type AABB = { min: THREE.Vector3; max: THREE.Vector3 };

function aabbFromBox(center: THREE.Vector3, size: THREE.Vector3): AABB {
  const half = size.clone().multiplyScalar(0.5);
  return {
    min: center.clone().sub(half),
    max: center.clone().add(half),
  };
}

function aabbOverlap(a: AABB, b: AABB): boolean {
  return (
    a.min.x < b.max.x &&
    a.max.x > b.min.x &&
    a.min.y < b.max.y &&
    a.max.y > b.min.y &&
    a.min.z < b.max.z &&
    a.max.z > b.min.z
  );
}

// ---------------------------------------------------------------------------
// Map definition — boxes that act as both visible meshes and AABB colliders.
// `kind: "ground"` is excluded from the wall AABB list so we collide with the
// floor only via the player's vertical resolution path.
// ---------------------------------------------------------------------------

type MapBox = {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: number;
  kind?: "wall" | "ground";
};

function buildMap(): MapBox[] {
  const boxes: MapBox[] = [];

  // Ground
  boxes.push({
    x: 0,
    y: -0.5,
    z: 0,
    w: MAP_HALF * 2,
    h: 1,
    d: MAP_HALF * 2,
    color: 0x202736,
    kind: "ground",
  });

  // Outer walls (4 ring walls, 5m tall, 1m thick)
  const wallH = 5;
  const wallT = 1;
  const ringColor = 0x3b4a6b;
  boxes.push({
    x: 0,
    y: wallH / 2,
    z: -MAP_HALF - wallT / 2,
    w: MAP_HALF * 2 + wallT * 2,
    h: wallH,
    d: wallT,
    color: ringColor,
  });
  boxes.push({
    x: 0,
    y: wallH / 2,
    z: MAP_HALF + wallT / 2,
    w: MAP_HALF * 2 + wallT * 2,
    h: wallH,
    d: wallT,
    color: ringColor,
  });
  boxes.push({
    x: -MAP_HALF - wallT / 2,
    y: wallH / 2,
    z: 0,
    w: wallT,
    h: wallH,
    d: MAP_HALF * 2,
    color: ringColor,
  });
  boxes.push({
    x: MAP_HALF + wallT / 2,
    y: wallH / 2,
    z: 0,
    w: wallT,
    h: wallH,
    d: MAP_HALF * 2,
    color: ringColor,
  });

  // Interior cover. A symmetric layout keeps both halves of the map fair.
  const cover = (x: number, z: number, w: number, h: number, d: number, c: number) =>
    boxes.push({ x, y: h / 2, z, w, h, d, color: c });

  // Central pillar
  cover(0, 0, 3, 3, 3, 0x7c5cff);
  // Mid-range cubes (4 around the centre)
  cover(-9, -9, 2, 1.6, 2, 0x4fa3ff);
  cover(9, -9, 2, 1.6, 2, 0x4fa3ff);
  cover(-9, 9, 2, 1.6, 2, 0x4fa3ff);
  cover(9, 9, 2, 1.6, 2, 0x4fa3ff);
  // Long sight-blockers near each side
  cover(-18, 0, 1.2, 2.6, 6, 0x6b7388);
  cover(18, 0, 1.2, 2.6, 6, 0x6b7388);
  cover(0, -18, 6, 2.6, 1.2, 0x6b7388);
  cover(0, 18, 6, 2.6, 1.2, 0x6b7388);
  // Tall corner posts you can run around
  cover(-22, -22, 2, 4, 2, 0xff5cae);
  cover(22, -22, 2, 4, 2, 0xff5cae);
  cover(-22, 22, 2, 4, 2, 0xff5cae);
  cover(22, 22, 2, 4, 2, 0xff5cae);

  return boxes;
}

// ---------------------------------------------------------------------------
// Player / Bot state
// ---------------------------------------------------------------------------

type Player = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  pitch: number;
  hp: number;
  alive: boolean;
  respawnIn: number;
  weapon: WeaponKind;
  ammo: { pistol: number; rifle: number; sniper: number };
  reloadingUntil: number;
  lastShotTime: number;
  onGround: boolean;
  crouching: boolean;
  /** Last frame's onGround flag — when transitioning from false → true,
   *  if the player is holding jump we bunny-hop and preserve momentum. */
  wasOnGround: boolean;
  /** Aim-down-sights flag, toggled by the right mouse button. */
  ads: boolean;
  /** Current zoomed FOV in degrees, eased toward target each frame. */
  fov: number;
  /** Accumulated recoil applied to pitch — added to look angle when
   *  rendering, then decays back to zero between shots. */
  recoilPitch: number;
  recoilYaw: number;
  /** Dynamic spread bonus that grows with sustained fire and decays
   *  back toward zero. Added to the weapon's base spread per shot. */
  bloom: number;
  /** Headbob phase — advances while moving on ground; 0 while still. */
  bobPhase: number;
  /** Weapon-swap animation timestamp. While > now, the held weapon
   *  slides off-screen and the new one slides on. */
  swapUntil: number;
  /** Spawn-protection timestamp. While `performance.now() < this`,
   *  damage from bots is ignored. */
  invincibleUntil: number;
};

type Bot = {
  id: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  hp: number;
  alive: boolean;
  respawnIn: number;
  state: "patrol" | "engage";
  target: THREE.Vector3 | null;
  nextWaypointAt: number;
  lastShotAt: number;
  /** Hit-flash timer — bots flash red briefly when struck so the
   *  player gets clear visual feedback the shot connected. */
  flashUntil: number;
};

type Tracer = {
  from: THREE.Vector3;
  to: THREE.Vector3;
  born: number; // timestamp ms
};

/** Floating world-space damage number — drifts up and fades. */
type DamageNumber = {
  pos: THREE.Vector3;
  amount: number;
  headshot: boolean;
  born: number; // ms
};

/** Killfeed entry shown briefly in the HUD. */
type KillfeedEntry = {
  id: number;
  text: string;
  headshot: boolean;
  born: number; // ms
};

function spawnPosition(): THREE.Vector3 {
  // Pick a random spawn near a corner so you don't spawn in someone's face.
  const corners: [number, number][] = [
    [-MAP_HALF + 4, -MAP_HALF + 4],
    [MAP_HALF - 4, -MAP_HALF + 4],
    [-MAP_HALF + 4, MAP_HALF - 4],
    [MAP_HALF - 4, MAP_HALF - 4],
  ];
  const c = corners[Math.floor(Math.random() * corners.length)];
  return new THREE.Vector3(c[0], 0, c[1]);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Krunker() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasMountRef = useRef<HTMLDivElement>(null);

  const [started, setStarted] = useState(false);
  const [over, setOver] = useState(false);
  const [paused, setPaused] = useState(false);
  const [pointerLocked, setPointerLocked] = useState(false);

  // Refs that mirror the React state, so the rAF loop can read live
  // values without forcing the loop's useEffect to re-run (and thus
  // tear down + rebuild the WebGL renderer) on every state flip.
  const startedRef = useRef(false);
  const pausedRef = useRef(false);
  const overRef = useRef(false);
  startedRef.current = started;
  pausedRef.current = paused;
  overRef.current = over;

  // HUD state — these are mirrored from the rAF loop's refs at most once
  // per frame via setHud. Keeping them in React state keeps the HUD
  // decoupled from the canvas (and lets it use Tailwind freely).
  const [hud, setHud] = useState({
    hp: PLAYER_MAX_HP,
    ammoCur: WEAPONS.pistol.magSize,
    ammoMax: WEAPONS.pistol.magSize,
    weapon: "pistol" as WeaponKind,
    reloading: false,
    reloadProgress: 0,
    kills: 0,
    deaths: 0,
    timeLeft: ROUND_DURATION,
    score: 0,
    botsAlive: BOT_COUNT,
    /** Spread radius in pixels for the dynamic crosshair — grows as
     *  the player fires sustained or moves at speed. */
    crosshairSpread: 0,
    /** True when scoped through the sniper's full overlay. */
    scoped: false,
    /** True when ADS-ing (any weapon). */
    ads: false,
    /** Spawn-protection banner — true while invincible after respawn. */
    invincible: false,
  });
  const [killfeed, setKillfeed] = useState<KillfeedEntry[]>([]);
  /** Damage numbers projected to screen space each frame and rendered
   *  via a separate React state so they participate in normal compose. */
  const [damageOverlay, setDamageOverlay] = useState<
    { id: number; x: number; y: number; alpha: number; amount: number; headshot: boolean }[]
  >([]);
  /** Bot name + HP labels, projected to screen space each frame so
   *  the player always knows where the enemies are even at a glance. */
  const [botLabels, setBotLabels] = useState<
    { id: number; x: number; y: number; hpFrac: number; dist: number }[]
  >([]);
  /** Directional damage indicators — angle (relative to player look)
   *  + birth ms, fade across 1.5s. Tells the player which side a hit
   *  came from. */
  const [damageHints, setDamageHints] = useState<
    { id: number; angle: number; born: number }[]
  >([]);
  /** "Show controls" toggle — visible by default, can be hidden with
   *  H to clean up the HUD once the player knows the bindings. */
  const [showGuide, setShowGuide] = useState(true);
  /** Last hitmarker: brief crosshair flash when our shot lands.
   *  Cleared by a self-scheduled setTimeout. */
  const [hitmarker, setHitmarker] = useState<
    { id: number; headshot: boolean } | null
  >(null);

  const submitStatus = useSubmitScoreOnGameOver(
    "krunker",
    hud.score,
    over,
  );

  // -------------------------------------------------------------------------
  // Loop refs (live state that doesn't need to trigger re-renders)
  // -------------------------------------------------------------------------

  const stateRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer | null;
    walls: AABB[];
    wallMeshes: THREE.Mesh[];
    boxes: MapBox[];
    player: Player;
    bots: Bot[];
    tracers: Tracer[];
    damageNumbers: DamageNumber[];
    pendingDamageHints: { id: number; angle: number; born: number }[];
    keys: Set<string>;
    mouseDown: boolean;
    ads: boolean;
    jumpHeld: boolean;
    elapsed: number; // seconds
    timeLeft: number;
    kills: number;
    deaths: number;
    score: number;
    /** Visible weapon mesh in front of the camera; swapped on weapon
     *  change so the HUD reflects the active firearm visually. */
    weaponMesh: THREE.Group | null;
    /** Muzzle flash light — flashes for ~60ms on each shot. */
    muzzleLight: THREE.PointLight | null;
    muzzleUntil: number;
    killfeedSeq: number;
    damageNumberSeq: number;
  }>({
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(75, 1, 0.1, 200),
    renderer: null,
    walls: [],
    wallMeshes: [],
    boxes: [],
    player: {
      pos: new THREE.Vector3(0, 0, 0),
      vel: new THREE.Vector3(),
      yaw: 0,
      pitch: 0,
      hp: PLAYER_MAX_HP,
      alive: true,
      respawnIn: 0,
      weapon: "pistol",
      ammo: {
        pistol: WEAPONS.pistol.magSize,
        rifle: WEAPONS.rifle.magSize,
        sniper: WEAPONS.sniper.magSize,
      },
      reloadingUntil: 0,
      lastShotTime: 0,
      onGround: false,
      crouching: false,
      wasOnGround: false,
      ads: false,
      fov: BASE_FOV,
      recoilPitch: 0,
      recoilYaw: 0,
      bloom: 0,
      bobPhase: 0,
      swapUntil: 0,
      invincibleUntil: 0,
    },
    bots: [],
    tracers: [],
    damageNumbers: [] as DamageNumber[],
    /** Queue of directional damage hints written by updateBot()
     *  (a top-level function that can't reach React setters) and
     *  drained in the per-frame loop into setDamageHints. */
    pendingDamageHints: [] as { id: number; angle: number; born: number }[],
    keys: new Set(),
    mouseDown: false,
    /** Holds whether the player is requesting ADS this frame. Tied to
     *  right mouse button. */
    ads: false,
    /** Whether jump is being held — used for bunny-hopping. */
    jumpHeld: false,
    elapsed: 0,
    timeLeft: ROUND_DURATION,
    kills: 0,
    deaths: 0,
    score: 0,
    weaponMesh: null,
    muzzleLight: null,
    muzzleUntil: 0,
    killfeedSeq: 0,
    damageNumberSeq: 0,
  });

  // -------------------------------------------------------------------------
  // Reset / start
  // -------------------------------------------------------------------------

  const reset = useCallback(() => {
    const st = stateRef.current;
    const spawn = spawnPosition();
    st.player.pos.set(spawn.x, PLAYER_HEIGHT, spawn.z);
    st.player.vel.set(0, 0, 0);
    st.player.yaw = 0;
    st.player.pitch = 0;
    st.player.hp = PLAYER_MAX_HP;
    st.player.alive = true;
    st.player.respawnIn = 0;
    st.player.weapon = "pistol";
    st.player.ammo = {
      pistol: WEAPONS.pistol.magSize,
      rifle: WEAPONS.rifle.magSize,
      sniper: WEAPONS.sniper.magSize,
    };
    st.player.reloadingUntil = 0;
    st.player.lastShotTime = 0;
    st.player.onGround = false;
    st.player.crouching = false;
    st.player.wasOnGround = false;
    st.player.ads = false;
    st.player.fov = BASE_FOV;
    st.player.recoilPitch = 0;
    st.player.recoilYaw = 0;
    st.player.bloom = 0;
    st.player.bobPhase = 0;
    st.player.swapUntil = 0;
    st.player.invincibleUntil = performance.now() + SPAWN_PROTECT_MS;
    st.tracers = [];
    st.damageNumbers = [];
    st.pendingDamageHints = [];
    st.ads = false;
    st.jumpHeld = false;
    setKillfeed([]);
    setDamageOverlay([]);
    setBotLabels([]);
    setDamageHints([]);

    st.bots = [];
    for (let i = 0; i < BOT_COUNT; i++) {
      const sp = spawnPosition();
      st.bots.push({
        id: i,
        pos: new THREE.Vector3(sp.x, 0, sp.z),
        vel: new THREE.Vector3(),
        yaw: Math.random() * Math.PI * 2,
        hp: BOT_HP,
        alive: true,
        respawnIn: 0,
        state: "patrol",
        target: null,
        nextWaypointAt: 0,
        lastShotAt: 0,
        flashUntil: 0,
      });
    }
    st.tracers = [];
    st.elapsed = 0;
    st.timeLeft = ROUND_DURATION;
    st.kills = 0;
    st.deaths = 0;
    st.score = 0;
    setHud((h) => ({
      ...h,
      hp: PLAYER_MAX_HP,
      ammoCur: WEAPONS.pistol.magSize,
      ammoMax: WEAPONS.pistol.magSize,
      weapon: "pistol",
      reloading: false,
      reloadProgress: 0,
      kills: 0,
      deaths: 0,
      timeLeft: ROUND_DURATION,
      score: 0,
      botsAlive: BOT_COUNT,
      crosshairSpread: 0,
      scoped: false,
      ads: false,
      invincible: true,
    }));
    setOver(false);
    setPaused(false);
  }, []);

  // -------------------------------------------------------------------------
  // Pointer lock + input
  // -------------------------------------------------------------------------

  const requestPointerLock = useCallback(() => {
    const el = canvasMountRef.current;
    if (!el) return;
    el.requestPointerLock?.();
  }, []);

  const start = useCallback(() => {
    reset();
    setStarted(true);
    // The lock request must be tied to the user gesture that called it,
    // so do it here on the same tick — we'll recover from blur in the
    // pointer-lock listener.
    requestPointerLock();
  }, [reset, requestPointerLock]);

  useEffect(() => {
    const el = canvasMountRef.current;
    if (!el) return;
    const onChange = () => {
      const locked = document.pointerLockElement === el;
      setPointerLocked(locked);
      if (!locked && started && !over) setPaused(true);
    };
    document.addEventListener("pointerlockchange", onChange);
    return () => document.removeEventListener("pointerlockchange", onChange);
  }, [started, over]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!pointerLocked) return;
      const st = stateRef.current;
      // Scale sensitivity with the current FOV so the on-screen
      // angular velocity stays roughly constant when scoping in /
      // sprinting. Without this, scoping the sniper (FOV 24) would
      // make a 1cm mouse flick whip the crosshair across the entire
      // arena. Every modern FPS does this.
      const sensScale = st.player.fov / BASE_FOV;
      st.player.yaw -= e.movementX * MOUSE_SENS * sensScale;
      st.player.pitch -= e.movementY * MOUSE_SENS * sensScale;
      const max = Math.PI / 2 - 0.05;
      st.player.pitch = Math.max(-max, Math.min(max, st.player.pitch));
    };
    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
  }, [pointerLocked]);

  useEffect(() => {
    const st = stateRef.current;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      st.keys.add(k);
      // Arrow keys would otherwise scroll the page when the canvas
      // doesn't have keyboard focus — stop that, since arrows are
      // movement here.
      if (
        k === "arrowup" ||
        k === "arrowdown" ||
        k === "arrowleft" ||
        k === "arrowright"
      ) {
        e.preventDefault();
      }
      if (k === "1") setWeapon("pistol");
      else if (k === "2") setWeapon("rifle");
      else if (k === "3") setWeapon("sniper");
      else if (k === "r") tryReload();
      else if (k === "c") st.player.crouching = true;
      else if (k === "h") setShowGuide((v) => !v);
      else if (k === "p" || k === "escape") {
        // Escape unlocks pointer naturally; treat as pause.
        if (started && !over) setPaused(true);
      } else if (k === " ") {
        e.preventDefault();
        st.jumpHeld = true;
        if (st.player.onGround && st.player.alive) {
          st.player.vel.y = JUMP_VEL;
          st.player.onGround = false;
          Sfx.jump();
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      st.keys.delete(k);
      if (k === "c") st.player.crouching = false;
      if (k === " ") st.jumpHeld = false;
    };
    const onMouseDown = (e: MouseEvent) => {
      if (!pointerLocked) return;
      if (e.button === 0) st.mouseDown = true;
      else if (e.button === 2) {
        // Right click → ADS. We toggle on hold rather than press, so
        // releasing the button drops back to hipfire instantly.
        st.ads = true;
        e.preventDefault();
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) st.mouseDown = false;
      else if (e.button === 2) st.ads = false;
    };
    const onContextMenu = (e: MouseEvent) => {
      // The browser right-click menu would steal pointer-lock focus.
      e.preventDefault();
    };
    const onWheel = (e: WheelEvent) => {
      if (!pointerLocked || !st.player.alive) return;
      // Negative deltaY = scroll up = previous weapon, positive = next.
      const cur = WEAPON_ORDER.indexOf(st.player.weapon);
      const dir = e.deltaY > 0 ? 1 : -1;
      const next =
        WEAPON_ORDER[
          (cur + dir + WEAPON_ORDER.length) % WEAPON_ORDER.length
        ];
      setWeapon(next);
      e.preventDefault();
    };
    // Clear all pressed-key + mouse state when the window loses
    // focus (alt-tab, browser switch, etc.). Without this, a key
    // released while the page wasn't focused stays in st.keys forever
    // and the player keeps running into a wall.
    const onBlur = () => {
      st.keys.clear();
      st.mouseDown = false;
      st.ads = false;
      st.jumpHeld = false;
      st.player.crouching = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("blur", onBlur);
    };
    // pointerLocked is read inside; we want a stable handler that consults
    // the latest value via closure — but since the handler depends on it,
    // re-bind so the gating is correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, over, pointerLocked]);

  const setWeapon = (kind: WeaponKind) => {
    const st = stateRef.current;
    if (!st.player.alive) return;
    if (st.player.weapon === kind) return;
    if (st.player.reloadingUntil > performance.now()) return;
    st.player.weapon = kind;
    // Brief swap animation — long enough that the new weapon visibly
    // rises into view but short enough that the player can fire
    // almost immediately. Was 240ms which felt clunky.
    st.player.swapUntil = performance.now() + 130;
    // Drop ADS while swapping so the camera doesn't visibly zoom mid-swap.
    st.ads = false;
    setHud((h) => ({
      ...h,
      weapon: kind,
      ammoMax: WEAPONS[kind].magSize,
      ammoCur: st.player.ammo[kind],
      ads: false,
      scoped: false,
    }));
    Sfx.click();
  };

  const tryReload = () => {
    const st = stateRef.current;
    if (!st.player.alive) return;
    const w = WEAPONS[st.player.weapon];
    if (st.player.ammo[st.player.weapon] >= w.magSize) return;
    if (st.player.reloadingUntil > performance.now()) return;
    st.player.reloadingUntil = performance.now() + w.reloadMs;
    Sfx.thud();
    setHud((h) => ({ ...h, reloading: true, reloadProgress: 0 }));
  };

  // -------------------------------------------------------------------------
  // Three.js init
  // -------------------------------------------------------------------------

  const mapBoxes = useMemo(() => buildMap(), []);

  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;
    const st = stateRef.current;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = false;
    mountEl.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.outline = "none";
    renderer.domElement.tabIndex = 0;
    st.renderer = renderer;

    // Scene + lighting
    st.scene = new THREE.Scene();
    st.scene.background = new THREE.Color(0x0a0e1a);
    st.scene.fog = new THREE.Fog(0x0a0e1a, 30, 90);
    const hemi = new THREE.HemisphereLight(0x9ec1ff, 0x1a1d2e, 0.85);
    st.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffeebb, 0.7);
    sun.position.set(20, 40, 10);
    st.scene.add(sun);

    // Camera
    st.camera = new THREE.PerspectiveCamera(78, 1, 0.1, 200);
    st.scene.add(st.camera);

    // Map geometry — and AABB list for collisions / raycasts.
    st.boxes = mapBoxes;
    st.walls = [];
    st.wallMeshes = [];
    for (const b of mapBoxes) {
      const geom = new THREE.BoxGeometry(b.w, b.h, b.d);
      const mat = new THREE.MeshLambertMaterial({ color: b.color });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(b.x, b.y, b.z);
      st.scene.add(mesh);
      st.wallMeshes.push(mesh);
      if (b.kind !== "ground") {
        st.walls.push(
          aabbFromBox(
            new THREE.Vector3(b.x, b.y, b.z),
            new THREE.Vector3(b.w, b.h, b.d),
          ),
        );
      }
    }

    // Bot meshes — one per bot, each with its own coloured material
    // so the four enemies are visually distinct (not just identical
    // red boxes). Hue is determined by bot id via BOT_HUES.
    for (const bot of st.bots) {
      const hue = BOT_HUES[bot.id % BOT_HUES.length];
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(BOT_RADIUS * 2, BOT_HEIGHT, BOT_RADIUS * 2),
        new THREE.MeshLambertMaterial({ color: hue }),
      );
      body.userData.botId = bot.id;
      body.userData.kind = "bot";
      body.userData.baseHue = hue;
      st.scene.add(body);
      // store on bot via a side-channel map (we'll rebuild meshes on reset)
      (bot as Bot & { mesh?: THREE.Mesh }).mesh = body;
    }

    // First-person weapon models — one mesh per weapon kind. Their
    // local positions are kept in userData.basePos so the loop can
    // animate them (swap slide, ADS shift, head-bob) without losing
    // the rest position.
    const wgroup = new THREE.Group();
    const addWeaponMesh = (
      kind: WeaponKind,
      geom: THREE.BufferGeometry,
      color: number,
      basePos: [number, number, number],
    ) => {
      const m = new THREE.Mesh(
        geom,
        new THREE.MeshLambertMaterial({ color }),
      );
      m.position.set(basePos[0], basePos[1], basePos[2]);
      m.userData.weapon = kind;
      m.userData.basePos = new THREE.Vector3(...basePos);
      m.visible = kind === "pistol";
      wgroup.add(m);
      return m;
    };
    addWeaponMesh(
      "pistol",
      new THREE.BoxGeometry(0.18, 0.2, 0.45),
      0x222831,
      [0.32, -0.32, -0.6],
    );
    addWeaponMesh(
      "rifle",
      new THREE.BoxGeometry(0.16, 0.18, 0.85),
      0x444b5a,
      [0.32, -0.32, -0.8],
    );
    addWeaponMesh(
      "sniper",
      new THREE.BoxGeometry(0.13, 0.16, 1.25),
      0x1b1f2a,
      [0.34, -0.3, -1.0],
    );
    st.camera.add(wgroup);
    st.weaponMesh = wgroup;

    // Muzzle flash light
    const ml = new THREE.PointLight(0xffe49a, 0, 6, 2);
    ml.position.set(0.32, -0.28, -0.95);
    st.camera.add(ml);
    st.muzzleLight = ml;

    // Resize handling — fit the canvas to its parent and update camera.
    const ro = new ResizeObserver(() => {
      const r = mountEl.getBoundingClientRect();
      renderer.setSize(r.width, r.height, false);
      st.camera.aspect = r.width / Math.max(1, r.height);
      st.camera.updateProjectionMatrix();
    });
    ro.observe(mountEl);

    // -------------------------------------------------------------------------
    // Main loop
    // -------------------------------------------------------------------------
    let raf = 0;
    let last = performance.now();
    /** Tracks whether the overlay was last reported as non-empty, so
     *  we can issue exactly one clearing setState when damage numbers
     *  expire (rather than reading a closure-stale damageOverlay). */
    let lastOverlayHadItems = false;
    const tick = (now: number) => {
      const dtMs = now - last;
      last = now;
      const dt = Math.min(0.05, dtMs / 1000);

      const live =
        startedRef.current &&
        !pausedRef.current &&
        !overRef.current &&
        document.pointerLockElement === mountEl;

      if (live) {
        st.elapsed += dt;
        st.timeLeft = Math.max(0, ROUND_DURATION - st.elapsed);
        if (st.timeLeft <= 0 && !overRef.current) {
          // round end → game over
          setOver(true);
          Sfx.gameOver();
        }

        // ----- Player respawn -----
        if (!st.player.alive) {
          st.player.respawnIn -= dt;
          if (st.player.respawnIn <= 0) {
            const sp = spawnPosition();
            st.player.pos.set(sp.x, PLAYER_HEIGHT, sp.z);
            st.player.vel.set(0, 0, 0);
            st.player.hp = PLAYER_MAX_HP;
            st.player.alive = true;
            st.player.ammo = {
              pistol: WEAPONS.pistol.magSize,
              rifle: WEAPONS.rifle.magSize,
              sniper: WEAPONS.sniper.magSize,
            };
            st.player.reloadingUntil = 0;
            st.player.invincibleUntil = now + SPAWN_PROTECT_MS;
            setHud((h) => ({
              ...h,
              hp: PLAYER_MAX_HP,
              ammoCur: WEAPONS[st.player.weapon].magSize,
              ammoMax: WEAPONS[st.player.weapon].magSize,
              reloading: false,
              reloadProgress: 0,
            }));
          }
        }

        // ----- Player movement -----
        if (st.player.alive) {
          const wishDir = new THREE.Vector3();
          if (st.keys.has("w") || st.keys.has("arrowup")) wishDir.z -= 1;
          if (st.keys.has("s") || st.keys.has("arrowdown")) wishDir.z += 1;
          if (st.keys.has("a") || st.keys.has("arrowleft")) wishDir.x -= 1;
          if (st.keys.has("d") || st.keys.has("arrowright")) wishDir.x += 1;
          if (wishDir.lengthSq() > 0) wishDir.normalize();
          // Rotate by yaw to get world-space wish direction.
          const cs = Math.cos(st.player.yaw);
          const sn = Math.sin(st.player.yaw);
          const wx = wishDir.x * cs - wishDir.z * sn;
          const wz = wishDir.x * sn + wishDir.z * cs;
          const sprintReq = st.keys.has("shift");
          const sprintAllowed = sprintReq && !st.ads && !st.player.crouching;
          const adsScale = st.ads ? ADS_MULT : 1;
          const crouchScale = st.player.crouching ? CROUCH_MULT : 1;
          const speedMult = (sprintAllowed ? SPRINT_MULT : 1) * adsScale * crouchScale;
          const target = new THREE.Vector3(
            wx * PLAYER_SPEED * speedMult,
            0,
            wz * PLAYER_SPEED * speedMult,
          );
          // Snappy ground accel; in-air retain horizontal velocity.
          const blend =
            st.player.onGround ? 1 - Math.exp(-dt * 14) : 1 - Math.exp(-dt * 3);
          st.player.vel.x += (target.x - st.player.vel.x) * blend;
          st.player.vel.z += (target.z - st.player.vel.z) * blend;
          st.player.vel.y -= GRAVITY * dt;

          // Step + collide on each axis.
          movePlayer(st.player, st.walls, dt);

          // (Auto bunny-hop was removed — it fired any time Space was
          // held while landing, which made movement feel jittery and
          // unintentional. Jumps now require a fresh Space press.)
          st.player.wasOnGround = st.player.onGround;

          // Head-bob phase: advance only when actually moving on the
          // ground, decay the visible amplitude when in the air or
          // standing still. The amplitude itself is applied at draw
          // time so it doesn't disturb collision math.
          const horizSpeed = Math.hypot(st.player.vel.x, st.player.vel.z);
          if (st.player.onGround && horizSpeed > 1.5) {
            st.player.bobPhase += dt * (sprintAllowed ? 12 : 8.5);
          }
        }

        // ----- FOV easing toward target (sprint / ADS / scope) -----
        if (st.player.alive) {
          const w = WEAPONS[st.player.weapon];
          let targetFov = BASE_FOV;
          if (st.ads) {
            targetFov = w.hasScope ? SCOPE_FOV : ADS_FOV;
          } else if (
            st.keys.has("shift") &&
            !st.player.crouching &&
            (Math.abs(st.player.vel.x) + Math.abs(st.player.vel.z)) > 1
          ) {
            targetFov = SPRINT_FOV;
          }
          // Scope snaps faster than ADS so it feels like a hard zoom.
          const fovBlend =
            1 - Math.exp(-dt * (w.hasScope && st.ads ? 22 : 14));
          st.player.fov += (targetFov - st.player.fov) * fovBlend;
          if (Math.abs(st.player.fov - st.camera.fov) > 0.01) {
            st.camera.fov = st.player.fov;
            st.camera.updateProjectionMatrix();
          }
        }

        // ----- Recoil + bloom decay -----
        // Pitch recoil walks the camera up after each shot, then drifts
        // back down. Yaw recoil is a per-shot random kick. Faster
        // decay so sustained auto-fire doesn't lift the screen off the
        // top of the canvas.
        st.player.recoilPitch *= Math.exp(-dt * 12);
        st.player.recoilYaw *= Math.exp(-dt * 14);
        st.player.bloom = Math.max(0, st.player.bloom - dt * 2.8);

        // ----- Player shooting -----
        if (st.player.alive) {
          const w = WEAPONS[st.player.weapon];
          const reloadingNow = st.player.reloadingUntil > now;
          if (reloadingNow) {
            const left = st.player.reloadingUntil - now;
            setHudIfChanged({
              reloading: true,
              reloadProgress: 1 - left / w.reloadMs,
            });
          } else if ((st.player.reloadingUntil > 0)) {
            // Reload finished this frame.
            st.player.reloadingUntil = 0;
            st.player.ammo[st.player.weapon] = w.magSize;
            setHud((h) => ({
              ...h,
              reloading: false,
              reloadProgress: 0,
              ammoCur: w.magSize,
            }));
            Sfx.click();
          }
          const wantFire =
            st.mouseDown &&
            !reloadingNow &&
            now >= st.player.swapUntil &&
            now - st.player.lastShotTime >= w.fireDelay * 1000;
          if (wantFire) {
            if (st.player.ammo[st.player.weapon] <= 0) {
              tryReload();
            } else {
              firePlayer(
                st,
                now,
                (entry) =>
                  setKillfeed((kf) => [entry, ...kf].slice(0, 5)),
                (headshot) => {
                  const id = performance.now();
                  setHitmarker({ id, headshot });
                  // Cleared on its own timer — guarded so a newer
                  // hitmarker doesn't get prematurely wiped by an
                  // older one's timer.
                  setTimeout(() => {
                    setHitmarker((cur) => (cur?.id === id ? null : cur));
                  }, 220);
                },
              );
              if (!w.auto) st.mouseDown = false; // semi-auto: require re-click
            }
          }
        }

        // ----- Bots -----
        for (const bot of st.bots) {
          if (!bot.alive) {
            bot.respawnIn -= dt;
            if (bot.respawnIn <= 0) {
              const sp = spawnPosition();
              bot.pos.set(sp.x, 0, sp.z);
              bot.hp = BOT_HP;
              bot.alive = true;
              bot.state = "patrol";
              bot.target = null;
              bot.nextWaypointAt = 0;
              bot.flashUntil = 0;
              const mesh = (bot as Bot & { mesh?: THREE.Mesh }).mesh;
              if (mesh) {
                (mesh.material as THREE.MeshLambertMaterial).color.setHex(
                  0xef4444,
                );
                mesh.visible = true;
              }
            }
            continue;
          }
          updateBot(bot, st, dt, now);
        }

        // ----- Round end if all bots dead and time hasn't expired -----
        // (We never end on bot wipe — they respawn — but clear any stale
        //  count.)

        // ----- Tracer cleanup -----
        st.tracers = st.tracers.filter((t) => now - t.born < 80);

        // ----- Damage numbers: age + project to screen for the React
        //       overlay to render. Drift each one upward in world space
        //       so they read as floating away from the impact point.
        for (const d of st.damageNumbers) d.pos.y += dt * 0.6;
        st.damageNumbers = st.damageNumbers.filter((d) => now - d.born < 800);
        if (st.damageNumbers.length > 0) {
          const overlay: typeof damageOverlay = [];
          const tmp = new THREE.Vector3();
          const halfW =
            (mountEl.getBoundingClientRect().width || 1) / 2;
          const halfH =
            (mountEl.getBoundingClientRect().height || 1) / 2;
          for (const d of st.damageNumbers) {
            tmp.copy(d.pos).project(st.camera);
            // Behind the camera → skip.
            if (tmp.z > 1) continue;
            const sx = tmp.x * halfW + halfW;
            const sy = -tmp.y * halfH + halfH;
            const k = (now - d.born) / 800;
            overlay.push({
              id: d.born,
              x: sx,
              y: sy,
              alpha: Math.max(0, 1 - k),
              amount: d.amount,
              headshot: d.headshot,
            });
          }
          setDamageOverlay(overlay);
          lastOverlayHadItems = overlay.length > 0;
        } else if (lastOverlayHadItems) {
          setDamageOverlay([]);
          lastOverlayHadItems = false;
        }

        // ----- Bot labels: project each live bot's position above
        //       its head into screen space so we can render an HTML
        //       name + HP bar overlay. Filters out off-screen and
        //       behind-camera bots.
        const rect = mountEl.getBoundingClientRect();
        const halfWB = (rect.width || 1) / 2;
        const halfHB = (rect.height || 1) / 2;
        const tmpB = new THREE.Vector3();
        const labels: { id: number; x: number; y: number; hpFrac: number; dist: number }[] = [];
        for (const bot of st.bots) {
          if (!bot.alive) continue;
          tmpB.set(bot.pos.x, BOT_HEIGHT + 0.35, bot.pos.z);
          tmpB.project(st.camera);
          if (tmpB.z > 1) continue; // behind camera
          // Generous clamp so labels stay near the edge even if the
          // bot is slightly off-screen.
          if (tmpB.x < -1.4 || tmpB.x > 1.4) continue;
          if (tmpB.y < -1.4 || tmpB.y > 1.4) continue;
          const sx = tmpB.x * halfWB + halfWB;
          const sy = -tmpB.y * halfHB + halfHB;
          const dx = bot.pos.x - st.player.pos.x;
          const dz = bot.pos.z - st.player.pos.z;
          labels.push({
            id: bot.id,
            x: sx,
            y: sy,
            hpFrac: Math.max(0, bot.hp / BOT_HP),
            dist: Math.hypot(dx, dz),
          });
        }
        setBotLabels(labels);

        // ----- Damage-hint drain (new hints queued from updateBot)
        //       + prune (1.5s lifetime). Functional updater so we read
        //       live state; same-reference return short-circuits the
        //       re-render when nothing changed.
        {
          const incoming = st.pendingDamageHints.splice(0);
          setDamageHints((hs) => {
            const fresh = hs.filter((h) => now - h.born < 1500);
            if (incoming.length === 0 && fresh.length === hs.length) return hs;
            return [...fresh, ...incoming].slice(-5);
          });
        }

        // ----- Killfeed prune (5s lifetime) -----
        // Use a functional updater so we read live state instead of the
        // closure-stale killfeed; short-circuit when no entries expired
        // so we don't trigger needless re-renders.
        setKillfeed((kf) => {
          const next = kf.filter((k) => now - k.born < 5000);
          return next.length === kf.length ? kf : next;
        });

        // ----- HUD push (low-frequency for scalar values) -----
        const w = WEAPONS[st.player.weapon];
        // Crosshair spread visualisation: combines weapon hipspread,
        // dynamic bloom from sustained fire, and motion penalty so the
        // reticle visibly opens up while running. Tightens dramatically
        // when ADS-ing; ADS or scope hides the regular crosshair.
        const motionPenalty =
          Math.min(1, Math.hypot(st.player.vel.x, st.player.vel.z) / 8) *
          0.018;
        const crosshairRadians =
          (st.ads ? w.adsSpread : w.hipSpread) +
          st.player.bloom * 0.5 +
          motionPenalty;
        // Project the spread cone half-angle into screen-space pixels.
        const halfH =
          (mountEl.getBoundingClientRect().height || 1) / 2;
        const focal = halfH / Math.tan((st.player.fov * Math.PI) / 360);
        const crosshairSpread = Math.tan(crosshairRadians) * focal;
        setHudIfChanged({
          hp: Math.max(0, Math.round(st.player.hp)),
          ammoCur: st.player.ammo[st.player.weapon],
          ammoMax: w.magSize,
          weapon: st.player.weapon,
          kills: st.kills,
          deaths: st.deaths,
          score: st.score,
          timeLeft: Math.ceil(st.timeLeft),
          botsAlive: st.bots.filter((b) => b.alive).length,
          crosshairSpread,
          scoped: st.ads && w.hasScope,
          ads: st.ads,
          invincible: now < st.player.invincibleUntil,
        });
      }

      // ----- Draw call (every frame, even paused, so the scene isn't black) -----
      // Sync camera to player. Eye height drops when crouching and bobs
      // gently while running. Recoil offsets the apparent look angle so
      // shots walk up the screen even though st.player.pitch itself is
      // exactly where the player aimed.
      const eyeBase = st.player.crouching
        ? st.player.pos.y - (PLAYER_HEIGHT - PLAYER_HEIGHT_CROUCH)
        : st.player.pos.y;
      const horizSpeedNow = Math.hypot(st.player.vel.x, st.player.vel.z);
      // Head-bob: smaller amplitude than before, and disabled entirely
      // while ADS-ing or scoping so the reticle doesn't wobble over
      // the target.
      const bobAmp =
        st.player.onGround && !st.ads
          ? Math.min(0.035, horizSpeedNow * 0.007)
          : 0;
      const bobY = Math.sin(st.player.bobPhase * 2) * bobAmp;
      const bobX = Math.cos(st.player.bobPhase) * bobAmp * 0.4;
      st.camera.position.set(
        st.player.pos.x,
        eyeBase + bobY,
        st.player.pos.z,
      );
      st.camera.rotation.order = "YXZ";
      st.camera.rotation.y = st.player.yaw + st.player.recoilYaw;
      st.camera.rotation.x = st.player.pitch + st.player.recoilPitch;
      // Very small roll while strafing for some kinetic life — kept
      // far smaller than before so it doesn't fight the aim.
      st.camera.rotation.z = bobX * 0.25;

      // Weapon mesh: visibility for the active weapon + swap-slide
      // animation. While swapping, the held weapon dives off-screen
      // and the new weapon rises from below. While ADS-ing the active
      // mesh tucks toward the centre of view and slightly forward.
      if (st.weaponMesh) {
        const swapLeft = Math.max(0, st.player.swapUntil - now);
        // Smooth ease-out so the gun rises into place instead of
        // linearly tweening (which read as a jerk on short durations).
        const swapLinear = swapLeft / 130; // 1 → fully off, 0 → at rest
        const swapK = swapLinear * swapLinear; // square = ease-out
        for (const m of st.weaponMesh.children) {
          const mesh = m as THREE.Mesh & {
            userData: { weapon?: WeaponKind; basePos?: THREE.Vector3 };
          };
          const wk = mesh.userData.weapon;
          if (!wk) continue;
          mesh.visible = wk === st.player.weapon;
          if (!mesh.visible || !mesh.userData.basePos) continue;
          const base = mesh.userData.basePos;
          // ADS: slide toward 0 X (centre) and a hair forward.
          const adsK = st.ads ? 1 : 0;
          const adsX = base.x * (1 - adsK * 0.85);
          const adsY =
            base.y +
            (WEAPONS[wk].hasScope ? 0.07 : 0.04) * adsK; // raise into the eye line
          const adsZ = base.z + 0.08 * adsK;
          // Smaller swap dip so it feels like a quick raise, not a
          // full hide-and-bring-back routine.
          const dipY = -0.18 * swapK;
          // Gun bob mirrors a small fraction of the camera bob.
          const gunBob = bobY * 0.25;
          mesh.position.set(adsX, adsY + dipY + gunBob, adsZ);
        }
      }

      // Sync bot meshes
      for (const bot of st.bots) {
        const mesh = (bot as Bot & { mesh?: THREE.Mesh }).mesh;
        if (!mesh) continue;
        if (!bot.alive) {
          mesh.visible = false;
          continue;
        }
        mesh.visible = true;
        mesh.position.set(bot.pos.x, BOT_HEIGHT / 2, bot.pos.z);
        mesh.rotation.y = bot.yaw;
        const baseHue =
          (mesh.userData.baseHue as number | undefined) ?? 0xef4444;
        if (bot.flashUntil > now) {
          // Lighten the bot's own colour for the hit flash rather
          // than swapping to generic pink, so it still looks like
          // "Bot 2" (orange) flashing rather than a different bot.
          (mesh.material as THREE.MeshLambertMaterial).color.setHex(
            lightenHex(baseHue, 0.55),
          );
        } else {
          (mesh.material as THREE.MeshLambertMaterial).color.setHex(baseHue);
        }
      }

      // Muzzle flash decay
      if (st.muzzleLight) {
        st.muzzleLight.intensity =
          st.muzzleUntil > now
            ? ((st.muzzleUntil - now) / 60) * 4
            : 0;
      }

      // Tracer rendering — clear old line segments and re-add active ones.
      while (st.scene.children.find((c) => c.userData?.kind === "tracer")) {
        const t = st.scene.children.find((c) => c.userData?.kind === "tracer");
        if (t) {
          st.scene.remove(t);
          if ((t as THREE.Line).geometry) (t as THREE.Line).geometry.dispose();
        }
      }
      for (const t of st.tracers) {
        const g = new THREE.BufferGeometry().setFromPoints([t.from, t.to]);
        const m = new THREE.LineBasicMaterial({ color: 0xfff3a8 });
        const line = new THREE.Line(g, m);
        line.userData.kind = "tracer";
        st.scene.add(line);
      }

      renderer.render(st.scene, st.camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      mountEl.removeChild(renderer.domElement);
      st.renderer = null;
    };
    // The loop reads started/paused/over via *Ref.current, so it doesn't
    // need to be re-created when those flip — we only re-init when the
    // map changes (which it doesn't during a round).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapBoxes]);

  // setHud only when scalars actually changed, to avoid React churn on every frame.
  const lastHudRef = useRef(hud);
  function setHudIfChanged(patch: Partial<typeof hud>) {
    const prev = lastHudRef.current;
    let changed = false;
    for (const k of Object.keys(patch) as (keyof typeof hud)[]) {
      if (patch[k] !== prev[k]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    const next = { ...prev, ...patch };
    lastHudRef.current = next;
    setHud(next);
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 flex flex-col bg-black"
    >
      <div
        ref={canvasMountRef}
        className="relative flex-1 min-h-0 w-full overflow-hidden cursor-none"
      >
        {/* HUD overlay — drawn over the WebGL canvas via absolute positioning */}
        {started && !over && (
          <>
            {/* Sniper scope overlay — full black mask with circular
                cut-out, crosshair lines, and a faint range marker.
                Replaces the regular crosshair when scoped. */}
            {hud.scoped ? (
              <div className="pointer-events-none absolute inset-0">
                {/* Black mask with a circular cut-out. We use four
                    edge bars + four corners so the SVG/clip-path
                    isn't needed. */}
                <div
                  className="absolute inset-0 bg-black"
                  style={{
                    WebkitMaskImage:
                      "radial-gradient(circle at 50% 50%, transparent 0, transparent 30%, black 31%)",
                    maskImage:
                      "radial-gradient(circle at 50% 50%, transparent 0, transparent 30%, black 31%)",
                  }}
                />
                {/* Reticle inside the scope */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-px h-[60vh] bg-rose-500/80" />
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-px w-[60vh] bg-rose-500/80" />
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 bg-rose-500 rounded-full" />
                {/* Tick marks on the vertical line for range-feel */}
                {[-60, -40, -20, 20, 40, 60].map((y) => (
                  <div
                    key={y}
                    className="absolute left-1/2 -translate-x-1/2 w-2 h-px bg-rose-500/60"
                    style={{ top: `calc(50% + ${y}px)` }}
                  />
                ))}
                {/* Vignette ring for the scope edge */}
                <div
                  className="absolute inset-0"
                  style={{
                    boxShadow: "inset 0 0 80px 20px rgba(0,0,0,0.85)",
                  }}
                />
              </div>
            ) : (
              <Crosshair spread={hud.crosshairSpread} ads={hud.ads} />
            )}

            {/* Hitmarker — short 'X' flash on the crosshair when a
                shot lands. Larger + rose for headshots, white for
                body hits. Pure CSS animation keyed by hitmarker.id
                so re-firing the same kind re-triggers the keyframes. */}
            {hitmarker && (
              <div
                key={hitmarker.id}
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
              >
                <div
                  className={`relative animate-krunker-hit ${
                    hitmarker.headshot
                      ? "w-10 h-10 text-rose-400"
                      : "w-7 h-7 text-white"
                  }`}
                  style={{
                    filter: "drop-shadow(0 0 6px rgba(0,0,0,0.7))",
                  }}
                >
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-45 origin-center block w-full h-0.5 bg-current" />
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45 origin-center block w-full h-0.5 bg-current" />
                </div>
              </div>
            )}

            {/* Spawn-protection badge — appears for the 1.5s window
                after a respawn so the player understands the bots
                aren't damaging them yet. */}
            {hud.invincible && (
              <div className="pointer-events-none absolute inset-0">
                <div
                  className="absolute inset-0"
                  style={{
                    boxShadow:
                      "inset 0 0 64px 12px rgba(56, 189, 248, 0.35)",
                  }}
                />
                <div className="absolute top-14 left-1/2 -translate-x-1/2 px-3 py-1 rounded-md bg-sky-500/25 border border-sky-300/50 text-sky-100 text-xs font-black uppercase tracking-wider">
                  🛡 Spawn protected
                </div>
              </div>
            )}

            {/* Top stats */}
            <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 text-white text-xs sm:text-sm font-bold">
              <span className="px-3 py-1 rounded-md bg-black/55 backdrop-blur-sm border border-white/10 inline-flex items-center gap-1.5">
                <span className="opacity-70">⏱</span>
                <span className="tabular-nums">
                  {Math.floor(hud.timeLeft / 60)}:
                  {String(hud.timeLeft % 60).padStart(2, "0")}
                </span>
              </span>
              <span className="px-3 py-1 rounded-md bg-black/55 backdrop-blur-sm border border-white/10 inline-flex items-center gap-1.5">
                <span className="opacity-70">KILLS</span>
                <b>{hud.kills}</b>
              </span>
              <span className="px-3 py-1 rounded-md bg-black/55 backdrop-blur-sm border border-white/10 inline-flex items-center gap-1.5">
                <span className="opacity-70">DEATHS</span>
                <b>{hud.deaths}</b>
              </span>
              <span className="px-3 py-1 rounded-md bg-black/55 backdrop-blur-sm border border-white/10 inline-flex items-center gap-1.5">
                <span className="opacity-70">SCORE</span>
                <b>{hud.score}</b>
              </span>
            </div>

            {/* Health bar — bottom-left */}
            <div className="pointer-events-none absolute bottom-3 left-3 w-56">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-white/70 mb-1 font-bold">
                <span>HP</span>
                <span className="tabular-nums">{hud.hp}</span>
              </div>
              <div className="h-2 rounded-full bg-black/55 border border-white/10 overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    hud.hp > 60
                      ? "bg-emerald-400"
                      : hud.hp > 25
                        ? "bg-amber-400"
                        : "bg-rose-500"
                  }`}
                  style={{ width: `${hud.hp}%` }}
                />
              </div>
            </div>

            {/* Ammo + weapon — bottom-right */}
            <div className="pointer-events-none absolute bottom-3 right-3 text-right">
              {/* Weapon strip — current weapon highlighted, others
                  shown as muted slots so players see what they can
                  swap to. Numbers (1/2/3) hint at the keybinds. */}
              <div className="flex items-center justify-end gap-1.5 mb-1">
                {WEAPON_ORDER.map((wk, i) => (
                  <div
                    key={wk}
                    className={`px-2 py-1 rounded-md text-[10px] uppercase tracking-wider font-black border transition-colors ${
                      wk === hud.weapon
                        ? "bg-amber-400/20 border-amber-400/60 text-amber-200"
                        : "bg-black/45 border-white/10 text-white/55"
                    }`}
                  >
                    <span className="opacity-60 mr-1">{i + 1}</span>
                    {WEAPONS[wk].name}
                  </div>
                ))}
              </div>
              <div className="text-3xl sm:text-4xl font-black text-white tabular-nums leading-none">
                <span>{hud.ammoCur}</span>
                <span className="text-white/40 text-xl sm:text-2xl"> / {hud.ammoMax}</span>
              </div>
              {hud.reloading && (
                <div className="mt-1 w-28 ml-auto h-1 rounded-full bg-black/55 border border-white/10 overflow-hidden">
                  <div
                    className="h-full bg-amber-400"
                    style={{ width: `${hud.reloadProgress * 100}%` }}
                  />
                </div>
              )}
              {hud.ads && !hud.scoped && (
                <div className="mt-1 text-[10px] uppercase tracking-wider text-amber-300 font-black">
                  ADS
                </div>
              )}
            </div>

            {/* Killfeed — top-left under the sound toggle. Latest kill
                at the top, fades after 5s (handled by the loop). */}
            <div className="pointer-events-none absolute top-14 left-3 flex flex-col gap-1 text-[11px] font-bold">
              {killfeed.map((k) => (
                <div
                  key={k.id}
                  className="px-2 py-1 rounded-md bg-black/55 backdrop-blur-sm border border-white/10 text-white inline-flex items-center gap-1.5"
                >
                  {k.headshot && (
                    <span className="text-rose-400" title="Headshot">
                      ◎
                    </span>
                  )}
                  <span>{k.text}</span>
                </div>
              ))}
            </div>

            {/* Floating damage numbers projected from world space */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {damageOverlay.map((d) => (
                <div
                  key={d.id}
                  className={`absolute font-black tabular-nums ${
                    d.headshot ? "text-rose-400 text-2xl" : "text-amber-300 text-lg"
                  }`}
                  style={{
                    left: `${d.x}px`,
                    top: `${d.y}px`,
                    opacity: d.alpha,
                    transform: "translate(-50%, -50%)",
                    textShadow: "0 0 8px rgba(0,0,0,0.85)",
                  }}
                >
                  {d.headshot ? `${d.amount}!` : d.amount}
                </div>
              ))}
            </div>

            {/* Bot labels — name + HP bar floating above each live
                bot in screen space. Distance hint helps the player
                size up a target. */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {botLabels.map((b) => (
                <div
                  key={b.id}
                  className="absolute"
                  style={{
                    left: `${b.x}px`,
                    top: `${b.y}px`,
                    transform: "translate(-50%, -100%)",
                  }}
                >
                  <div className="flex flex-col items-center gap-0.5">
                    <div className="px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-sm border border-rose-400/30 text-rose-200 text-[10px] font-black uppercase tracking-wider whitespace-nowrap">
                      Bot {b.id + 1}
                      <span className="opacity-60 ml-1 normal-case font-normal">
                        {b.dist < 100 ? `${Math.round(b.dist)}m` : ""}
                      </span>
                    </div>
                    <div className="w-12 h-1 rounded-full bg-black/55 border border-white/10 overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          b.hpFrac > 0.6
                            ? "bg-emerald-400"
                            : b.hpFrac > 0.25
                              ? "bg-amber-400"
                              : "bg-rose-500"
                        }`}
                        style={{ width: `${b.hpFrac * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Directional damage indicators — small red wedges that
                arc around a virtual circle in front of the player,
                positioned by the angle from which the shot came.
                Fades over 1.5s. */}
            {damageHints.length > 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                {damageHints.map((d) => {
                  const k = Math.min(
                    1,
                    (performance.now() - d.born) / 1500,
                  );
                  if (k >= 1) return null;
                  // 120 = radius in px from screen centre.
                  return (
                    <div
                      key={d.id}
                      className="absolute w-0 h-0"
                      style={{
                        opacity: 1 - k,
                        transform: `rotate(${d.angle}rad)`,
                      }}
                    >
                      <div
                        className="absolute -left-8 -top-32 w-16 h-4 rounded-full"
                        style={{
                          background:
                            "linear-gradient(to top, rgba(239,68,68,0.95), rgba(239,68,68,0))",
                          filter: "blur(0.5px)",
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Guide text — bottom-centre, dim and unobtrusive.
                Toggle with H. */}
            {showGuide && (
              <div className="pointer-events-none absolute bottom-12 left-1/2 -translate-x-1/2 text-[10px] sm:text-[11px] text-white/65 font-bold tracking-wide text-center max-w-[640px] px-3">
                <span className="opacity-80">WASD / Arrows</span> move ·{" "}
                <span className="opacity-80">Mouse</span> aim ·{" "}
                <span className="opacity-80">LMB</span> fire ·{" "}
                <span className="opacity-80">RMB</span> ADS ·{" "}
                <span className="opacity-80">Space</span> jump ·{" "}
                <span className="opacity-80">Shift</span> sprint ·{" "}
                <span className="opacity-80">C</span> crouch ·{" "}
                <span className="opacity-80">R</span> reload ·{" "}
                <span className="opacity-80">1·2·3</span> weapons ·{" "}
                <span className="opacity-80">Scroll</span> swap ·{" "}
                <span className="opacity-80">P</span> pause ·{" "}
                <span className="opacity-80">H</span> hide
              </div>
            )}

            {/* Bots-alive minimap pill */}
            <div className="pointer-events-none absolute top-3 right-3 px-3 py-1 rounded-md bg-black/55 backdrop-blur-sm border border-white/10 text-white text-xs font-bold">
              <span className="opacity-70">ENEMIES </span>
              <b>{hud.botsAlive}</b>
              <span className="opacity-70"> / {BOT_COUNT}</span>
            </div>

            {/* Sound toggle (top-left) */}
            <div className="absolute top-3 left-3">
              <SoundToggle />
            </div>
          </>
        )}

        {/* Click-to-resume overlay — covers the canvas when pointer lock isn't ours */}
        {started && !over && !pointerLocked && !paused && (
          <button
            onClick={requestPointerLock}
            className="absolute inset-0 flex items-center justify-center bg-black/55 text-white text-lg font-bold cursor-pointer"
          >
            Click to capture mouse
          </button>
        )}

        {!started && !over && (
          <GameOverlay
            icon="🎯"
            title="Krunker"
            subtitle={
              <>
                <b>WASD</b> move · <b>Mouse</b> aim · <b>Click</b> shoot ·{" "}
                <b>Space</b> jump · <b>Shift</b> sprint · <b>R</b> reload ·{" "}
                <b>1/2</b> swap weapons. Round lasts {ROUND_DURATION}s. Mouse will
                lock to the canvas.
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
            subtitle="Click resume to recapture the mouse."
            primary={{
              label: "▶ Resume",
              onClick: () => {
                setPaused(false);
                requestPointerLock();
              },
            }}
          />
        )}
        {over && (
          <GameOverlay
            icon={hud.kills > hud.deaths ? "🏆" : "💀"}
            title={hud.kills > hud.deaths ? "Round won" : "Round over"}
            subtitle={
              <>
                <b>{hud.kills}</b> kills · <b>{hud.deaths}</b> deaths · score{" "}
                <b>{hud.score}</b>
              </>
            }
            primary={{ label: "Play again", onClick: start }}
          >
            <ScoreStatus gameSlug="krunker" status={submitStatus} />
          </GameOverlay>
        )}
      </div>
    </div>
  );
}

/** Dynamic crosshair — four ticks that radiate out from the centre by
 *  the current spread (in pixels). Shrinks tight when ADS-ing. */
function Crosshair({ spread, ads }: { spread: number; ads: boolean }) {
  // Clamp so wild spread doesn't push ticks off-screen.
  const s = Math.max(2, Math.min(60, spread));
  const tick = "absolute bg-white/85 transition-[transform] duration-75";
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="relative w-2 h-2">
        {/* Centre dot — slightly bigger when ADS-ing for a clear pip */}
        <div
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ${
            ads ? "w-1.5 h-1.5 bg-rose-400" : "w-1 h-1 bg-white/95"
          }`}
        />
        <div
          className={`${tick} left-1/2 -translate-x-1/2 w-0.5 h-2`}
          style={{ top: `-${s}px` }}
        />
        <div
          className={`${tick} left-1/2 -translate-x-1/2 w-0.5 h-2`}
          style={{ bottom: `-${s}px` }}
        />
        <div
          className={`${tick} top-1/2 -translate-y-1/2 h-0.5 w-2`}
          style={{ left: `-${s}px` }}
        />
        <div
          className={`${tick} top-1/2 -translate-y-1/2 h-0.5 w-2`}
          style={{ right: `-${s}px` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Movement helpers
// ---------------------------------------------------------------------------

function playerAabb(p: Player): AABB {
  // The player's AABB is centred on pos; pos.y is eye height, so the
  // collider extends from (pos.y - height) to pos.y. Crouching shrinks
  // the collider so the player can duck under low cover.
  const height = p.crouching ? PLAYER_HEIGHT_CROUCH : PLAYER_HEIGHT;
  return {
    min: new THREE.Vector3(
      p.pos.x - PLAYER_RADIUS,
      p.pos.y - height,
      p.pos.z - PLAYER_RADIUS,
    ),
    max: new THREE.Vector3(
      p.pos.x + PLAYER_RADIUS,
      p.pos.y,
      p.pos.z + PLAYER_RADIUS,
    ),
  };
}

function movePlayer(p: Player, walls: AABB[], dt: number) {
  // Per-axis swept resolution. Move on X, resolve. Move on Z, resolve.
  // Move on Y last with the ground plane as the floor (y=0 means feet on
  // floor, eye at PLAYER_HEIGHT).
  // X
  p.pos.x += p.vel.x * dt;
  resolveAxis(p, walls, "x");
  // Z
  p.pos.z += p.vel.z * dt;
  resolveAxis(p, walls, "z");
  // Y
  p.pos.y += p.vel.y * dt;
  // Ground floor: feet at 0 → eye at the standing or crouching height.
  const eyeFloor = p.crouching ? PLAYER_HEIGHT_CROUCH : PLAYER_HEIGHT;
  if (p.pos.y < eyeFloor) {
    p.pos.y = eyeFloor;
    p.vel.y = 0;
    p.onGround = true;
  } else {
    p.onGround = false;
  }
  resolveAxis(p, walls, "y");
  // Clamp inside map
  p.pos.x = Math.max(-MAP_HALF + 0.6, Math.min(MAP_HALF - 0.6, p.pos.x));
  p.pos.z = Math.max(-MAP_HALF + 0.6, Math.min(MAP_HALF - 0.6, p.pos.z));
}

function resolveAxis(p: Player, walls: AABB[], axis: "x" | "y" | "z") {
  const aabb = playerAabb(p);
  for (const w of walls) {
    if (!aabbOverlap(aabb, w)) continue;
    // Push the player out along `axis` by the smaller of the two
    // overlap sides. This is simple and correct enough for box maps.
    if (axis === "x") {
      const left = w.max.x - aabb.min.x;
      const right = aabb.max.x - w.min.x;
      if (left < right) p.pos.x += left;
      else p.pos.x -= right;
      p.vel.x = 0;
    } else if (axis === "z") {
      const front = w.max.z - aabb.min.z;
      const back = aabb.max.z - w.min.z;
      if (front < back) p.pos.z += front;
      else p.pos.z -= back;
      p.vel.z = 0;
    } else {
      const up = w.max.y - aabb.min.y;
      const down = aabb.max.y - w.min.y;
      if (up < down) {
        p.pos.y += up;
        p.vel.y = 0;
        p.onGround = true;
      } else {
        p.pos.y -= down;
        if (p.vel.y > 0) p.vel.y = 0;
      }
    }
    // Recompute aabb for next wall
    Object.assign(aabb, playerAabb(p));
  }
}

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------

function firePlayer(
  st: LoopState,
  now: number,
  pushKillfeed: (e: KillfeedEntry) => void,
  pushHitmarker: (headshot: boolean) => void,
) {
  const w = WEAPONS[st.player.weapon];
  st.player.ammo[st.player.weapon] -= 1;
  st.player.lastShotTime = now;

  // Per-weapon firing sound — pistol snap, rifle pop, sniper boom.
  if (w.kind === "sniper") Sfx.shootSniper();
  else if (w.kind === "rifle") Sfx.shootRifle();
  else Sfx.shootPistol();

  // Apply recoil + bloom. Recoil walks the camera up + sideways for a
  // single shot; bloom grows the spread cone for the *next* shot
  // until it decays back. Both decay over time in the loop.
  st.player.recoilPitch += w.recoil;
  st.player.recoilYaw += (Math.random() - 0.5) * w.recoilSide;
  st.player.bloom = Math.min(0.06, st.player.bloom + w.recoil * 0.6);

  // Compute ray direction from yaw + pitch with weapon spread + bloom.
  const yaw = st.player.yaw + st.player.recoilYaw;
  const pitch = st.player.pitch + st.player.recoilPitch;
  const baseSpread = st.ads ? w.adsSpread : w.hipSpread;
  const spread = baseSpread + st.player.bloom;
  const rx = (Math.random() - 0.5) * spread;
  const ry = (Math.random() - 0.5) * spread;
  const dir = new THREE.Vector3(
    -Math.sin(yaw + ry) * Math.cos(pitch + rx),
    Math.sin(pitch + rx),
    -Math.cos(yaw + ry) * Math.cos(pitch + rx),
  ).normalize();

  // Find the closest hit: bots first, then walls.
  const origin = st.player.pos.clone();
  let bestT = 200; // max range
  let hitBot: Bot | null = null;
  for (const bot of st.bots) {
    if (!bot.alive) continue;
    // Build bot AABB
    const ba: AABB = {
      min: new THREE.Vector3(
        bot.pos.x - BOT_RADIUS,
        0,
        bot.pos.z - BOT_RADIUS,
      ),
      max: new THREE.Vector3(
        bot.pos.x + BOT_RADIUS,
        BOT_HEIGHT,
        bot.pos.z + BOT_RADIUS,
      ),
    };
    const t = rayAabb(origin, dir, ba);
    if (t > 0 && t < bestT) {
      bestT = t;
      hitBot = bot;
    }
  }
  // Walls — if a wall is closer than the best bot hit, the wall blocked.
  let wallT = bestT;
  for (const wall of st.walls) {
    const t = rayAabb(origin, dir, wall);
    if (t > 0 && t < wallT) {
      wallT = t;
    }
  }
  const finalT = Math.min(bestT, wallT);
  // Tracer
  st.tracers.push({
    from: origin.clone().add(dir.clone().multiplyScalar(0.5)),
    to: origin.clone().add(dir.clone().multiplyScalar(finalT)),
    born: now,
  });
  // Muzzle flash
  st.muzzleUntil = now + 60;
  if (st.muzzleLight) st.muzzleLight.intensity = 4;

  if (hitBot && bestT <= wallT) {
    // Headshot detection: project the hit point and check whether
    // it landed in the upper third of the bot's body.
    const hitPoint = origin.clone().add(dir.clone().multiplyScalar(bestT));
    const headshot = hitPoint.y >= HEADSHOT_Y;
    const dmg = Math.round(w.damage * (headshot ? HEADSHOT_MULT : 1));
    hitBot.hp -= dmg;
    hitBot.flashUntil = now + 100;
    // Floating damage number at the impact point.
    st.damageNumbers.push({
      pos: hitPoint.clone(),
      amount: dmg,
      headshot,
      born: now,
    });
    // Crosshair hitmarker + the crisp confirm tick.
    pushHitmarker(headshot);
    Sfx.hitmarker();
    if (hitBot.hp <= 0) {
      hitBot.alive = false;
      hitBot.respawnIn = 2.0;
      st.kills += 1;
      st.score += headshot ? 150 : 100;
      Sfx.bigPickup();
      // Killfeed: "You → Bot N" with optional headshot icon. The
      // React state handles the actual rendering / fade.
      st.killfeedSeq += 1;
      pushKillfeed({
        id: st.killfeedSeq,
        text: `You · ${w.name} · Bot ${hitBot.id + 1}`,
        headshot,
        born: now,
      });
    } else {
      Sfx.hit();
    }
  }
}

/** Slab-test ray vs AABB. Returns the entry t (or -1 if no hit / behind). */
function rayAabb(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  box: AABB,
): number {
  let tmin = -Infinity;
  let tmax = Infinity;
  for (const axis of ["x", "y", "z"] as const) {
    const o = origin[axis];
    const d = dir[axis];
    const min = box.min[axis];
    const max = box.max[axis];
    if (Math.abs(d) < 1e-8) {
      if (o < min || o > max) return -1;
      continue;
    }
    const inv = 1 / d;
    let t1 = (min - o) * inv;
    let t2 = (max - o) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (tmax < 0) return -1;
  return tmin > 0 ? tmin : tmax;
}

// ---------------------------------------------------------------------------
// Bot AI
// ---------------------------------------------------------------------------

function updateBot(
  bot: Bot,
  st: LoopState,
  dt: number,
  now: number,
) {
  // Line of sight — origin at chest height, ray to player.
  const eye = new THREE.Vector3(bot.pos.x, BOT_HEIGHT * 0.85, bot.pos.z);
  const toPlayer = new THREE.Vector3()
    .subVectors(st.player.pos, eye);
  const distToPlayer = toPlayer.length();
  let canSee = false;
  if (st.player.alive && distToPlayer < BOT_VISION) {
    const dir = toPlayer.clone().normalize();
    let blockedT = distToPlayer;
    for (const wall of st.walls) {
      const t = rayAabb(eye, dir, wall);
      if (t > 0 && t < blockedT) {
        blockedT = t;
        break;
      }
    }
    if (blockedT >= distToPlayer - 0.05) canSee = true;
  }

  // State transitions
  if (canSee) {
    bot.state = "engage";
    bot.target = st.player.pos.clone();
  } else if (bot.state === "engage") {
    // Lost sight — go investigate the last known target a bit, then patrol.
    if (!bot.target || bot.pos.distanceTo(bot.target) < 1.5) {
      bot.state = "patrol";
      bot.target = null;
    }
  }

  // Pick a wander target if needed.
  if (bot.state === "patrol" && (!bot.target || now / 1000 > bot.nextWaypointAt)) {
    bot.target = new THREE.Vector3(
      (Math.random() - 0.5) * (MAP_HALF - 4) * 2,
      0,
      (Math.random() - 0.5) * (MAP_HALF - 4) * 2,
    );
    bot.nextWaypointAt = now / 1000 + 3 + Math.random() * 3;
  }

  // Move toward target — but keep some distance when engaging.
  if (bot.target) {
    const flat = new THREE.Vector3(
      bot.target.x - bot.pos.x,
      0,
      bot.target.z - bot.pos.z,
    );
    const distFlat = flat.length();
    if (distFlat > 0.05) {
      flat.normalize();
      bot.yaw = Math.atan2(flat.x, flat.z) + Math.PI;
      const desiredDist = bot.state === "engage" ? 8 : 0;
      const speedScale =
        bot.state === "engage" && distToPlayer < desiredDist
          ? -0.6 // back off
          : 1;
      bot.vel.x = flat.x * BOT_SPEED * speedScale;
      bot.vel.z = flat.z * BOT_SPEED * speedScale;
    } else {
      bot.vel.x = 0;
      bot.vel.z = 0;
    }
  }

  // Apply movement with simple wall collision (cylinder vs AABBs).
  bot.pos.x += bot.vel.x * dt;
  resolveBotAxis(bot, st.walls, "x");
  bot.pos.z += bot.vel.z * dt;
  resolveBotAxis(bot, st.walls, "z");
  // Clamp
  bot.pos.x = Math.max(-MAP_HALF + 0.6, Math.min(MAP_HALF - 0.6, bot.pos.x));
  bot.pos.z = Math.max(-MAP_HALF + 0.6, Math.min(MAP_HALF - 0.6, bot.pos.z));

  // Shoot the player if engaged + cooldown expired.
  if (
    bot.state === "engage" &&
    canSee &&
    st.player.alive &&
    now - bot.lastShotAt > BOT_FIRE_DELAY * 1000
  ) {
    bot.lastShotAt = now;
    const dir = new THREE.Vector3()
      .subVectors(st.player.pos, eye)
      .normalize();
    // Light spread so they aren't perfect.
    dir.x += (Math.random() - 0.5) * 0.04;
    dir.y += (Math.random() - 0.5) * 0.04;
    dir.z += (Math.random() - 0.5) * 0.04;
    dir.normalize();
    st.tracers.push({
      from: eye.clone().add(dir.clone().multiplyScalar(0.6)),
      to: eye.clone().add(dir.clone().multiplyScalar(distToPlayer)),
      born: now,
    });
    Sfx.shoot();
    // Apply damage if the spread didn't push the bullet off-line.
    // Lower floor + steeper falloff than the first cut so bots aren't
    // free aimbots at any range — a player who keeps moving + uses
    // cover should be able to outplay one.
    const hitChance = Math.max(0.1, 1 - distToPlayer / 22);
    const protectedNow = now < st.player.invincibleUntil;
    if (!protectedNow && Math.random() < hitChance) {
      st.player.hp -= BOT_DAMAGE;
      Sfx.hit();
      // Spawn a directional damage indicator on the HUD so the player
      // can see which side the hit came from, even if the attacker is
      // behind them or behind cover.
      const dx = bot.pos.x - st.player.pos.x;
      const dz = bot.pos.z - st.player.pos.z;
      const cs = Math.cos(st.player.yaw);
      const sn = Math.sin(st.player.yaw);
      // Forward = (-sin(yaw), 0, -cos(yaw)); Right = (cos(yaw), 0, -sin(yaw)).
      const fwd = -dx * sn - dz * cs;
      const rgt = dx * cs - dz * sn;
      const angleRel = Math.atan2(rgt, fwd);
      // Push into a queue on the state ref; the per-frame loop in
      // the component drains this into React state via setDamageHints.
      // (We can't call setDamageHints from a top-level function.)
      st.pendingDamageHints.push({
        id: now + Math.random(),
        angle: angleRel,
        born: now,
      });
      if (st.player.hp <= 0) {
        st.player.hp = 0;
        st.player.alive = false;
        st.player.respawnIn = RESPAWN_DELAY;
        st.deaths += 1;
        Sfx.gameOver();
      }
    }
  }
}

function resolveBotAxis(bot: Bot, walls: AABB[], axis: "x" | "z") {
  const ba: AABB = {
    min: new THREE.Vector3(
      bot.pos.x - BOT_RADIUS,
      0,
      bot.pos.z - BOT_RADIUS,
    ),
    max: new THREE.Vector3(
      bot.pos.x + BOT_RADIUS,
      BOT_HEIGHT,
      bot.pos.z + BOT_RADIUS,
    ),
  };
  for (const w of walls) {
    if (!aabbOverlap(ba, w)) continue;
    if (axis === "x") {
      const left = w.max.x - ba.min.x;
      const right = ba.max.x - w.min.x;
      if (left < right) bot.pos.x += left;
      else bot.pos.x -= right;
      bot.vel.x = 0;
    } else {
      const front = w.max.z - ba.min.z;
      const back = ba.max.z - w.min.z;
      if (front < back) bot.pos.z += front;
      else bot.pos.z -= back;
      bot.vel.z = 0;
    }
    ba.min.x = bot.pos.x - BOT_RADIUS;
    ba.max.x = bot.pos.x + BOT_RADIUS;
    ba.min.z = bot.pos.z - BOT_RADIUS;
    ba.max.z = bot.pos.z + BOT_RADIUS;
  }
}

/** Mix a 24-bit hex colour toward white by `amount` (0..1). Used to
 *  produce the hit-flash variant of each bot's colour. */
function lightenHex(hex: number, amount: number): number {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  const mr = Math.round(r + (255 - r) * amount);
  const mg = Math.round(g + (255 - g) * amount);
  const mb = Math.round(b + (255 - b) * amount);
  return (mr << 16) | (mg << 8) | mb;
}

// The runtime shape of stateRef.current — used by firePlayer / updateBot
// to share a single canonical state type without re-declaring fields.
type LoopState = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  walls: AABB[];
  boxes: MapBox[];
  player: Player;
  bots: Bot[];
  tracers: Tracer[];
  damageNumbers: DamageNumber[];
  pendingDamageHints: { id: number; angle: number; born: number }[];
  keys: Set<string>;
  mouseDown: boolean;
  ads: boolean;
  jumpHeld: boolean;
  elapsed: number;
  timeLeft: number;
  kills: number;
  deaths: number;
  score: number;
  weaponMesh: THREE.Group | null;
  muzzleLight: THREE.PointLight | null;
  muzzleUntil: number;
  killfeedSeq: number;
  damageNumberSeq: number;
};
