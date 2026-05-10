"use client";

import { useEffect, useState } from "react";
import { isMuted, setMuted, subscribeMuted } from "@/lib/sound";

/** Small mute pill for game HUDs. State mirrors localStorage and
 *  every other SoundToggle on the page through `subscribeMuted`. */
export function SoundToggle({ className = "" }: { className?: string }) {
  const [m, setM] = useState(false);
  useEffect(() => {
    setM(isMuted());
    return subscribeMuted(setM);
  }, []);
  const toggle = () => setMuted(!m);
  return (
    <button
      type="button"
      onClick={toggle}
      title={m ? "Unmute" : "Mute"}
      aria-label={m ? "Unmute" : "Mute"}
      className={`px-2.5 py-1 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--accent)] text-[var(--foreground)] text-sm transition-colors ${className}`}
    >
      {m ? "🔇" : "🔊"}
    </button>
  );
}
