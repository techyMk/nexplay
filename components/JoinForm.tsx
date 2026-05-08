"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function JoinForm({
  basePath = "/multiplayer/tic-tac-toe",
}: {
  basePath?: string;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const c = code.trim().toUpperCase();
        if (c.length >= 4) router.push(`${basePath}/${c}`);
      }}
      className="flex flex-col gap-3 mt-3"
    >
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="ABC123"
        maxLength={8}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        className="font-mono text-lg tracking-[0.3em] uppercase text-center h-12 px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-glow)] transition-colors"
      />
      <button
        type="submit"
        className="h-10 rounded-xl bg-white text-black text-sm font-bold hover:scale-[1.02] transition-transform"
      >
        Join
      </button>
    </form>
  );
}
