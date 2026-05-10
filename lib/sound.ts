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
  /** Quiet footstep — single low blip, designed to be played
   *  rhythmically during movement without becoming annoying. */
  step: () =>
    play({ freq: 80, duration: 0.05, type: "sine", volume: 0.07 }),
  /** Bright treasure ping for gems / sparkly pickups. */
  gem: () => {
    play({
      freq: 880,
      endFreq: 1320,
      duration: 0.1,
      type: "triangle",
      volume: 0.18,
    });
    play({
      freq: 1320,
      duration: 0.14,
      type: "triangle",
      volume: 0.16,
      delay: 0.08,
    });
  },
  /** Treasure-chest opening flourish — a low thud followed by a
   *  rising arpeggio. */
  chest: () => {
    play({ freq: 220, duration: 0.08, type: "triangle", volume: 0.2 });
    play({
      freq: 600,
      endFreq: 880,
      duration: 0.18,
      type: "triangle",
      volume: 0.2,
      delay: 0.06,
    });
    play({
      freq: 1320,
      duration: 0.12,
      type: "triangle",
      volume: 0.16,
      delay: 0.18,
    });
  },
};

/** Background ambient drone — a small chord through a low-pass
 *  filter, optionally with a slow LFO modulating the filter for
 *  movement. Used by Treasure Hunt to give each map its own
 *  atmosphere (warm cave, ominous ruins, cold vault). The returned
 *  handle exposes `setVolume` so the caller can duck during
 *  pause/over screens, and `stop` so it can be torn down on level
 *  change or component unmount. Auto-subscribes to the global mute
 *  flag so toggling the SoundToggle drops it to 0 even mid-loop. */
export type AmbienceConfig = {
  /** Hz frequencies that make up the chord. */
  notes: number[];
  type: OscillatorType;
  /** Master gain when audible. Keep small (≈0.02–0.05); ambience
   *  should sit *under* gameplay sounds, not on top. */
  volume: number;
  /** Cutoff for the static low-pass filter. */
  filterFreq: number;
  /** Optional slow filter modulation: how far to swing the cutoff. */
  modDepth?: number;
  /** Modulation frequency in Hz (typically < 1 for slow drift). */
  modSpeed?: number;
};

export type Ambience = {
  setVolume: (v: number) => void;
  stop: () => void;
};

export function createAmbience(config: AmbienceConfig): Ambience | null {
  if (typeof window === "undefined") return null;
  const ac = ensureCtx();
  if (!ac) return null;

  const masterGain = ac.createGain();
  masterGain.gain.value = 0;

  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 0.7;
  filter.frequency.value = config.filterFreq;
  filter.connect(masterGain);

  const oscillators: OscillatorNode[] = [];
  for (const freq of config.notes) {
    const osc = ac.createOscillator();
    osc.type = config.type;
    osc.frequency.value = freq;
    const oscGain = ac.createGain();
    oscGain.gain.value = 1 / config.notes.length;
    osc.connect(oscGain);
    oscGain.connect(filter);
    osc.start();
    oscillators.push(osc);
  }

  let lfo: OscillatorNode | null = null;
  if (config.modDepth && config.modSpeed) {
    lfo = ac.createOscillator();
    lfo.frequency.value = config.modSpeed;
    const lfoGain = ac.createGain();
    lfoGain.gain.value = config.modDepth;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
  }

  masterGain.connect(ac.destination);

  let stopped = false;
  let currentVolume = config.volume;

  // Fade in
  masterGain.gain.setTargetAtTime(
    isMuted() ? 0 : config.volume,
    ac.currentTime,
    0.6,
  );

  // Keep the ambience in sync with the global mute toggle so a click
  // on the SoundToggle pill silences us mid-loop without the caller
  // having to plumb anything through.
  const unsubscribe = subscribeMuted((muted) => {
    if (stopped) return;
    masterGain.gain.setTargetAtTime(
      muted ? 0 : currentVolume,
      ac.currentTime,
      0.3,
    );
  });

  return {
    setVolume(v) {
      if (stopped) return;
      currentVolume = v;
      masterGain.gain.setTargetAtTime(
        isMuted() ? 0 : v,
        ac.currentTime,
        0.4,
      );
    },
    stop() {
      if (stopped) return;
      stopped = true;
      unsubscribe();
      masterGain.gain.setTargetAtTime(0, ac.currentTime, 0.4);
      // Stop the underlying oscillators after the fade so we don't
      // hear a click. 800 ms covers the fade comfortably.
      setTimeout(() => {
        for (const osc of oscillators) {
          try {
            osc.stop();
          } catch {
            // already stopped
          }
        }
        if (lfo) {
          try {
            lfo.stop();
          } catch {
            // already stopped
          }
        }
        try {
          masterGain.disconnect();
        } catch {
          // already disconnected
        }
      }, 800);
    },
  };
}

/** Continuous engine-noise generator. Two oscillators (sawtooth +
 *  triangle a fifth above) feed a low-pass filter and a master gain;
 *  the caller updates frequency every frame to bind pitch to vehicle
 *  speed. Respects the global mute flag. Returns null if WebAudio
 *  isn't available. */
export type Engine = {
  /** Set the engine's note (Hz) and master volume in one call. */
  update: (freq: number, volume: number) => void;
  /** Tear down the oscillators and disconnect the graph. */
  stop: () => void;
};

export function createEngine(): Engine | null {
  if (typeof window === "undefined") return null;
  const ac = ensureCtx();
  if (!ac) return null;

  const osc = ac.createOscillator();
  osc.type = "sawtooth";
  const harmonic = ac.createOscillator();
  harmonic.type = "triangle";

  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 0.7;
  lp.frequency.value = 800;

  const gain = ac.createGain();
  gain.gain.value = 0;

  osc.connect(lp);
  harmonic.connect(lp);
  lp.connect(gain);
  gain.connect(ac.destination);

  osc.start();
  harmonic.start();

  let stopped = false;

  return {
    update(freq, volume) {
      if (stopped) return;
      const t = ac.currentTime;
      osc.frequency.setTargetAtTime(freq, t, 0.04);
      harmonic.frequency.setTargetAtTime(freq * 1.5, t, 0.04);
      lp.frequency.setTargetAtTime(400 + freq * 1.4, t, 0.08);
      const target = isMuted() ? 0 : volume;
      gain.gain.setTargetAtTime(target, t, 0.05);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      try {
        osc.stop();
        harmonic.stop();
      } catch {
        // already stopped
      }
      try {
        gain.disconnect();
      } catch {
        // already disconnected
      }
    },
  };
}
