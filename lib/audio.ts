/**
 * Programmatic sound manager. Synthesises short "casual game" sounds
 * with the Web Audio API instead of shipping audio files — keeps
 * bundle size at zero and avoids licensing/hosting concerns. Each
 * sound is a tiny oscillator burst with a quick attack/decay envelope.
 *
 * Mute state is persisted in localStorage and synced across tabs via
 * the storage event so toggling on /settings updates everywhere.
 */

const MUTE_KEY = "nexplay:muted";

export type SoundName =
  | "click"
  | "pop"
  | "success"
  | "fail"
  | "level"
  | "warn";

class SoundManager {
  private ctx: AudioContext | null = null;
  private muted = false;
  private listeners: Set<() => void> = new Set();

  /** Lazy-init AudioContext on first user interaction (autoplay policy). */
  private ensureCtx() {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      try {
        this.ctx = new Ctor();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  initFromStorage() {
    if (typeof window === "undefined") return;
    this.muted = window.localStorage.getItem(MUTE_KEY) === "true";
    window.addEventListener("storage", (e) => {
      if (e.key === MUTE_KEY) {
        this.muted = e.newValue === "true";
        this.notify();
      }
    });
  }

  isMuted() {
    return this.muted;
  }

  setMuted(v: boolean) {
    this.muted = v;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(MUTE_KEY, String(v));
    }
    this.notify();
  }

  /** Subscribe to mute changes. Returns an unsubscribe. */
  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  /** Plays a one-shot sound. Silently no-ops when muted or pre-init. */
  play(name: SoundName) {
    if (this.muted) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    switch (name) {
      case "click":
        burst(ctx, now, { freq: 880, type: "square", duration: 0.04, vol: 0.05 });
        break;
      case "pop":
        burst(ctx, now, { freq: 520, type: "sine", duration: 0.09, vol: 0.07, slideTo: 980 });
        break;
      case "success":
        burst(ctx, now, { freq: 523, type: "triangle", duration: 0.1, vol: 0.08 });
        burst(ctx, now + 0.1, { freq: 659, type: "triangle", duration: 0.1, vol: 0.08 });
        burst(ctx, now + 0.2, { freq: 784, type: "triangle", duration: 0.18, vol: 0.09 });
        break;
      case "fail":
        burst(ctx, now, { freq: 440, type: "sawtooth", duration: 0.13, vol: 0.07 });
        burst(ctx, now + 0.13, { freq: 311, type: "sawtooth", duration: 0.18, vol: 0.07 });
        break;
      case "level":
        burst(ctx, now, { freq: 700, type: "triangle", duration: 0.08, vol: 0.07 });
        burst(ctx, now + 0.08, { freq: 1050, type: "triangle", duration: 0.14, vol: 0.08 });
        break;
      case "warn":
        burst(ctx, now, { freq: 360, type: "square", duration: 0.06, vol: 0.07 });
        burst(ctx, now + 0.08, { freq: 360, type: "square", duration: 0.06, vol: 0.07 });
        break;
    }
  }
}

function burst(
  ctx: AudioContext,
  startAt: number,
  opts: {
    freq: number;
    type: OscillatorType;
    duration: number;
    vol: number;
    slideTo?: number;
  },
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts.type;
  osc.frequency.setValueAtTime(opts.freq, startAt);
  if (opts.slideTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(
      opts.slideTo,
      startAt + opts.duration,
    );
  }
  // Quick attack, exponential decay
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(opts.vol, startAt + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + opts.duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + opts.duration + 0.02);
}

export const sound = new SoundManager();
