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
const PLAYER_RADIUS = 0.4;
const PLAYER_SPEED = 6.5;
const SPRINT_MULT = 1.45;
const JUMP_VEL = 7.2;
const GRAVITY = 22;
const MOUSE_SENS = 0.0022;

const PLAYER_MAX_HP = 100;
const RESPAWN_DELAY = 1.5;
const ROUND_DURATION = 90; // seconds

const BOT_COUNT = 4;
const BOT_HP = 80;
const BOT_RADIUS = 0.5;
const BOT_HEIGHT = 1.7;
const BOT_SPEED = 3.6;
const BOT_VISION = 28;
const BOT_FIRE_DELAY = 0.7; // seconds between shots
const BOT_DAMAGE = 8;

type WeaponKind = "pistol" | "rifle";
type WeaponSpec = {
  name: string;
  kind: WeaponKind;
  damage: number;
  fireDelay: number; // seconds between shots
  spread: number; // radians of cone
  magSize: number;
  reloadMs: number;
  auto: boolean;
};

const WEAPONS: Record<WeaponKind, WeaponSpec> = {
  pistol: {
    name: "Pistol",
    kind: "pistol",
    damage: 32,
    fireDelay: 0.28,
    spread: 0.005,
    magSize: 12,
    reloadMs: 1100,
    auto: false,
  },
  rifle: {
    name: "Rifle",
    kind: "rifle",
    damage: 18,
    fireDelay: 0.09,
    spread: 0.022,
    magSize: 30,
    reloadMs: 1700,
    auto: true,
  },
};

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
  ammo: { pistol: number; rifle: number };
  reloadingUntil: number;
  lastShotTime: number;
  onGround: boolean;
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
  born: number; // timestamp seconds
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
    weapon: "Pistol" as string,
    reloading: false,
    reloadProgress: 0,
    kills: 0,
    deaths: 0,
    timeLeft: ROUND_DURATION,
    score: 0,
    botsAlive: BOT_COUNT,
  });

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
    keys: Set<string>;
    mouseDown: boolean;
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
      ammo: { pistol: WEAPONS.pistol.magSize, rifle: WEAPONS.rifle.magSize },
      reloadingUntil: 0,
      lastShotTime: 0,
      onGround: false,
    },
    bots: [],
    tracers: [],
    keys: new Set(),
    mouseDown: false,
    elapsed: 0,
    timeLeft: ROUND_DURATION,
    kills: 0,
    deaths: 0,
    score: 0,
    weaponMesh: null,
    muzzleLight: null,
    muzzleUntil: 0,
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
    };
    st.player.reloadingUntil = 0;
    st.player.lastShotTime = 0;
    st.player.onGround = false;

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
      weapon: "Pistol",
      reloading: false,
      reloadProgress: 0,
      kills: 0,
      deaths: 0,
      timeLeft: ROUND_DURATION,
      score: 0,
      botsAlive: BOT_COUNT,
    }));
    setOver(false);
    setPaused(false);
  }, []);

  const start = useCallback(() => {
    reset();
    setStarted(true);
    // The lock request must be tied to the user gesture that called it,
    // so do it here on the same tick — we'll recover from blur in the
    // pointer-lock listener.
    requestPointerLock();
  }, [reset]);

  // -------------------------------------------------------------------------
  // Pointer lock + input
  // -------------------------------------------------------------------------

  const requestPointerLock = useCallback(() => {
    const el = canvasMountRef.current;
    if (!el) return;
    el.requestPointerLock?.();
  }, []);

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
      st.player.yaw -= e.movementX * MOUSE_SENS;
      st.player.pitch -= e.movementY * MOUSE_SENS;
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
      if (k === "1") setWeapon("pistol");
      else if (k === "2") setWeapon("rifle");
      else if (k === "r") tryReload();
      else if (k === "p" || k === "escape") {
        // Escape unlocks pointer naturally; treat as pause.
        if (started && !over) setPaused(true);
      } else if (k === " ") {
        e.preventDefault();
        if (st.player.onGround && st.player.alive) {
          st.player.vel.y = JUMP_VEL;
          st.player.onGround = false;
          Sfx.jump();
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      st.keys.delete(e.key.toLowerCase());
    };
    const onMouseDown = (e: MouseEvent) => {
      if (!pointerLocked) return;
      if (e.button === 0) st.mouseDown = true;
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) st.mouseDown = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
    };
    // pointerLocked is read inside; we want a stable handler that consults
    // the latest value via closure — but since the handler depends on it,
    // re-bind so the gating is correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, over, pointerLocked]);

  const setWeapon = (kind: WeaponKind) => {
    const st = stateRef.current;
    if (!st.player.alive) return;
    if (st.player.reloadingUntil > performance.now()) return;
    st.player.weapon = kind;
    if (st.weaponMesh) {
      st.weaponMesh.children.forEach((m) => {
        m.visible = (m as THREE.Object3D & { userData: { weapon?: string } })
          .userData.weapon === kind;
      });
    }
    setHud((h) => ({
      ...h,
      weapon: WEAPONS[kind].name,
      ammoMax: WEAPONS[kind].magSize,
      ammoCur: st.player.ammo[kind],
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

    // Bot meshes (player has none — first-person camera). We attach a
    // mesh per bot via userData and reuse them across deaths.
    const botMat = new THREE.MeshLambertMaterial({ color: 0xef4444 });
    for (const bot of st.bots) {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(BOT_RADIUS * 2, BOT_HEIGHT, BOT_RADIUS * 2),
        botMat,
      );
      body.userData.botId = bot.id;
      body.userData.kind = "bot";
      st.scene.add(body);
      // store on bot via a side-channel map (we'll rebuild meshes on reset)
      (bot as Bot & { mesh?: THREE.Mesh }).mesh = body;
    }

    // First-person weapon model — two children, one per weapon kind, with
    // visibility toggled in setWeapon.
    const wgroup = new THREE.Group();
    const pistol = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.2, 0.45),
      new THREE.MeshLambertMaterial({ color: 0x222831 }),
    );
    pistol.position.set(0.32, -0.32, -0.6);
    pistol.userData.weapon = "pistol";
    wgroup.add(pistol);
    const rifle = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.18, 0.85),
      new THREE.MeshLambertMaterial({ color: 0x444b5a }),
    );
    rifle.position.set(0.32, -0.32, -0.8);
    rifle.userData.weapon = "rifle";
    rifle.visible = false;
    wgroup.add(rifle);
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
            };
            st.player.reloadingUntil = 0;
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
          if (st.keys.has("w")) wishDir.z -= 1;
          if (st.keys.has("s")) wishDir.z += 1;
          if (st.keys.has("a")) wishDir.x -= 1;
          if (st.keys.has("d")) wishDir.x += 1;
          if (wishDir.lengthSq() > 0) wishDir.normalize();
          // Rotate by yaw to get world-space wish direction.
          const cs = Math.cos(st.player.yaw);
          const sn = Math.sin(st.player.yaw);
          const wx = wishDir.x * cs - wishDir.z * sn;
          const wz = wishDir.x * sn + wishDir.z * cs;
          const sprint = st.keys.has("shift") ? SPRINT_MULT : 1;
          const target = new THREE.Vector3(
            wx * PLAYER_SPEED * sprint,
            0,
            wz * PLAYER_SPEED * sprint,
          );
          // Snappy ground accel; in-air retain horizontal velocity.
          const blend = st.player.onGround ? 1 - Math.exp(-dt * 14) : 1 - Math.exp(-dt * 3);
          st.player.vel.x += (target.x - st.player.vel.x) * blend;
          st.player.vel.z += (target.z - st.player.vel.z) * blend;
          st.player.vel.y -= GRAVITY * dt;

          // Step + collide on each axis.
          movePlayer(st.player, st.walls, dt);
        }

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
            now - st.player.lastShotTime >= w.fireDelay * 1000;
          if (wantFire) {
            if (st.player.ammo[st.player.weapon] <= 0) {
              tryReload();
            } else {
              firePlayer(st, now);
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

        // ----- HUD push (low-frequency for scalar values) -----
        setHudIfChanged({
          hp: Math.max(0, Math.round(st.player.hp)),
          ammoCur: st.player.ammo[st.player.weapon],
          ammoMax: WEAPONS[st.player.weapon].magSize,
          weapon: WEAPONS[st.player.weapon].name,
          kills: st.kills,
          deaths: st.deaths,
          score: st.score,
          timeLeft: Math.ceil(st.timeLeft),
          botsAlive: st.bots.filter((b) => b.alive).length,
        });
      }

      // ----- Draw call (every frame, even paused, so the scene isn't black) -----
      // Sync camera to player.
      st.camera.position.copy(st.player.pos);
      st.camera.position.y = st.player.pos.y; // pos.y is eye height
      st.camera.rotation.order = "YXZ";
      st.camera.rotation.y = st.player.yaw;
      st.camera.rotation.x = st.player.pitch;

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
        if (bot.flashUntil > now) {
          (mesh.material as THREE.MeshLambertMaterial).color.setHex(0xfca5a5);
        } else {
          (mesh.material as THREE.MeshLambertMaterial).color.setHex(0xef4444);
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
            {/* Crosshair */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative w-6 h-6">
                <div className="absolute left-1/2 top-0 -translate-x-1/2 w-0.5 h-2 bg-white/80" />
                <div className="absolute left-1/2 bottom-0 -translate-x-1/2 w-0.5 h-2 bg-white/80" />
                <div className="absolute top-1/2 left-0 -translate-y-1/2 h-0.5 w-2 bg-white/80" />
                <div className="absolute top-1/2 right-0 -translate-y-1/2 h-0.5 w-2 bg-white/80" />
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 bg-white/90 rounded-full" />
              </div>
            </div>

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
              <div className="text-[10px] uppercase tracking-wider text-white/60 font-bold">
                {hud.weapon}
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
            </div>

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

// ---------------------------------------------------------------------------
// Movement helpers
// ---------------------------------------------------------------------------

function playerAabb(p: Player): AABB {
  // The player's AABB is centred on pos; pos.y is eye height, so the
  // collider extends from (pos.y - PLAYER_HEIGHT) to pos.y.
  return {
    min: new THREE.Vector3(
      p.pos.x - PLAYER_RADIUS,
      p.pos.y - PLAYER_HEIGHT,
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
  // Ground floor: feet at 0 → eye at PLAYER_HEIGHT
  if (p.pos.y < PLAYER_HEIGHT) {
    p.pos.y = PLAYER_HEIGHT;
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
  st: NonNullable<ReturnType<typeof loopStateShape>>,
  now: number,
) {
  const w = WEAPONS[st.player.weapon];
  st.player.ammo[st.player.weapon] -= 1;
  st.player.lastShotTime = now;
  if (w.kind === "pistol") Sfx.shoot();
  else Sfx.shoot();

  // Compute ray direction from yaw + pitch with weapon spread.
  const yaw = st.player.yaw;
  const pitch = st.player.pitch;
  const spread = w.spread;
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
    hitBot.hp -= w.damage;
    hitBot.flashUntil = now + 100;
    if (hitBot.hp <= 0) {
      hitBot.alive = false;
      hitBot.respawnIn = 2.0;
      st.kills += 1;
      st.score += 100;
      Sfx.bigPickup();
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
  st: NonNullable<ReturnType<typeof loopStateShape>>,
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
    // (Approximation: chance based on distance.)
    const hitChance = Math.max(0.25, 1 - distToPlayer / 30);
    if (Math.random() < hitChance) {
      st.player.hp -= BOT_DAMAGE;
      Sfx.hit();
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

// Helper type to keep firePlayer / updateBot signatures honest. We use
// the runtime stateRef.current shape via this typeof helper, but never
// actually call the helper — its sole purpose is type inference.
function loopStateShape() {
  return null as unknown as {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    walls: AABB[];
    boxes: MapBox[];
    player: Player;
    bots: Bot[];
    tracers: Tracer[];
    keys: Set<string>;
    mouseDown: boolean;
    elapsed: number;
    timeLeft: number;
    kills: number;
    deaths: number;
    score: number;
    weaponMesh: THREE.Group | null;
    muzzleLight: THREE.PointLight | null;
    muzzleUntil: number;
  };
}
