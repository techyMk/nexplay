"use client";

import { useEffect, useState } from "react";
import { sound, type SoundName } from "./audio";

/**
 * Hook into the global SoundManager. Returns a `play()` callback for
 * triggering one-shot sounds, plus the live mute state and a setter
 * to toggle from anywhere.
 *
 * The manager initialises from localStorage on mount and syncs across
 * tabs via the storage event.
 */
export function useSound() {
  const [muted, setMutedState] = useState<boolean>(() => sound.isMuted());

  useEffect(() => {
    sound.initFromStorage();
    setMutedState(sound.isMuted());
    return sound.subscribe(() => setMutedState(sound.isMuted()));
  }, []);

  const play = (name: SoundName) => sound.play(name);
  const setMuted = (v: boolean) => sound.setMuted(v);

  return { play, muted, setMuted };
}
