"use client";

/**
 * Lightweight WebAudio-based sound effects for the games.
 *
 * Why programmatic, not audio files? It keeps the repo asset-free,
 * guarantees cross-browser playback without preloading, and gives
 * us fine-grained control over volume / pitch / shape per event.
 *
 * The module:
 *  - Lazily creates a single shared AudioContext on first sound
 *    (browsers won't let us create one before user interaction —
 *    by the time any game triggers a sound, the user has clicked
 *    "Play", so the context is unlocked).
 *  - Persists a mute flag in localStorage under "nexplay:muted".
 *  - Exposes a flat `Sfx` object of named presets so call sites
 *    read as `Sfx.jump()`, `Sfx.match()`, `Sfx.gameOver()` etc.
 */

let ctx: AudioContext | null = null;
let mutedCache: boolean | null = null;
const MUTED_KEY = "nexplay:muted";
const listeners = new Set<(muted: boolean) => void>();

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      const C =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

export function isMuted(): boolean {
  if (mutedCache !== null) return mutedCache;
  if (typeof window === "undefined") return false;
  mutedCache = localStorage.getItem(MUTED_KEY) === "1";
  return mutedCache;
}

export function setMuted(v: boolean) {
  mutedCache = v;
  if (typeof window !== "undefined") {
    localStorage.setItem(MUTED_KEY, v ? "1" : "0");
  }
  listeners.forEach((fn) => fn(v));
}

export function subscribeMuted(fn: (muted: boolean) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

type ToneOpts = {
  freq: number;
  duration?: number;
  type?: OscillatorType;
  volume?: number;
  attack?: number;
  release?: number;
  /** If set, the oscillator slides from `freq` to `endFreq` over `duration`. */
  endFreq?: number;
  /** Schedule `delay` seconds in the future (lets us layer chords). */
  delay?: number;
};

function play(opts: ToneOpts) {
  if (isMuted()) return;
  const ac = ensureCtx();
  if (!ac) return;
  const t0 = ac.currentTime + (opts.delay ?? 0);
  const dur = opts.duration ?? 0.1;
  const vol = opts.volume ?? 0.18;
  const attack = Math.min(opts.attack ?? 0.005, dur * 0.4);
  const release = Math.min(opts.release ?? 0.04, dur * 0.6);

  const osc = ac.createOscillator();
  osc.type = opts.type ?? "square";
  osc.frequency.setValueAtTime(opts.freq, t0);
  if (opts.endFreq != null) {
    const target = Math.max(0.01, opts.endFreq);
    osc.frequency.exponentialRampToValueAtTime(target, t0 + dur);
  }

  const g = ac.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.linearRampToValueAtTime(vol, t0 + Math.max(attack, dur - release));
  g.gain.linearRampToValueAtTime(0, t0 + dur);

  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.04);
}

/** Common game-event sound presets. Call these directly from event
 *  handlers — they're cheap and deduplicated against the mute flag. */
export const Sfx = {
  click: () =>
    play({ freq: 760, duration: 0.04, type: "square", volume: 0.12 }),
  pickup: () =>
    play({
      freq: 700,
      endFreq: 1100,
      duration: 0.09,
      type: "triangle",
      volume: 0.18,
    }),
  bigPickup: () => {
    play({
      freq: 660,
      endFreq: 990,
      duration: 0.08,
      type: "triangle",
      volume: 0.2,
    });
    play({
      freq: 990,
      duration: 0.12,
      type: "triangle",
      volume: 0.18,
      delay: 0.06,
    });
  },
  jump: () =>
    play({
      freq: 280,
      endFreq: 700,
      duration: 0.14,
      type: "square",
      volume: 0.18,
    }),
  thud: () => play({ freq: 140, duration: 0.06, type: "sine", volume: 0.22 }),
  hit: () =>
    play({
      freq: 110,
      endFreq: 80,
      duration: 0.1,
      type: "sawtooth",
      volume: 0.22,
    }),
  shoot: () =>
    play({
      freq: 950,
      endFreq: 240,
      duration: 0.07,
      type: "square",
      volume: 0.16,
    }),
  bounce: () =>
    play({ freq: 520, duration: 0.05, type: "square", volume: 0.16 }),
  match: () => {
    play({ freq: 600, duration: 0.06, type: "triangle", volume: 0.2 });
    play({
      freq: 900,
      duration: 0.1,
      type: "triangle",
      volume: 0.2,
      delay: 0.05,
    });
  },
  bigMatch: () => {
    [600, 800, 1000, 1300].forEach((f, i) =>
      play({
        freq: f,
        duration: 0.08,
        type: "triangle",
        volume: 0.2,
        delay: i * 0.04,
      }),
    );
  },
  move: () =>
    play({ freq: 360, duration: 0.03, type: "square", volume: 0.1 }),
  rotate: () =>
    play({ freq: 520, duration: 0.04, type: "square", volume: 0.12 }),
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) =>
      play({
        freq: f,
        duration: 0.13,
        type: "triangle",
        volume: 0.22,
        delay: i * 0.08,
      }),
    );
  },
  gameOver: () =>
    play({
      freq: 440,
      endFreq: 110,
      duration: 0.4,
      type: "sawtooth",
      volume: 0.22,
    }),
  error: () => {
    play({ freq: 220, duration: 0.06, type: "sawtooth", volume: 0.18 });
    play({
      freq: 196,
      duration: 0.1,
      type: "sawtooth",
      volume: 0.18,
      delay: 0.06,
    });
  },
  place: () =>
    play({ freq: 440, duration: 0.05, type: "sine", volume: 0.15 }),
  boost: () =>
    play({
      freq: 200,
      endFreq: 600,
      duration: 0.2,
      type: "sawtooth",
      volume: 0.15,
    }),
};
