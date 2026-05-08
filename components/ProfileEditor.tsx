"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const AVATARS = ["🎮", "🚀", "🏆", "⚡", "🌟", "🐍", "👻", "🦄", "🐉", "🤖", "👾", "🦊"];

export function ProfileEditor({
  initial,
}: {
  initial: { display_name: string; avatar_emoji: string; email: string };
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.display_name);
  const [avatar, setAvatar] = useState(initial.avatar_emoji);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setBusy(true);
    setSaved(false);
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    await supabase
      .from("profiles")
      .upsert({ id: u.user.id, display_name: name, avatar_emoji: avatar });
    setBusy(false);
    setSaved(true);
    router.refresh();
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex items-center justify-center text-3xl">
          {avatar}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-[var(--muted)]">Signed in as</div>
          <div className="font-bold truncate">{initial.email}</div>
        </div>
      </div>

      <label className="block mb-4">
        <span className="text-xs uppercase tracking-wider text-[var(--muted)] block mb-1">
          Display name
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={32}
          className="w-full h-11 px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-glow)] text-sm transition-colors"
        />
      </label>

      <div className="mb-4">
        <div className="text-xs uppercase tracking-wider text-[var(--muted)] mb-2">
          Avatar
        </div>
        <div className="flex flex-wrap gap-2">
          {AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAvatar(a)}
              className={`w-12 h-12 rounded-xl text-2xl transition-all ${
                a === avatar
                  ? "bg-[var(--accent)] scale-110"
                  : "bg-[var(--surface-2)] hover:bg-[var(--surface-2)]/60"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={save}
        disabled={busy}
        className="px-5 py-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] text-white text-sm font-bold disabled:opacity-50 hover:scale-105 transition-transform"
      >
        {busy ? "Saving…" : saved ? "Saved ✓" : "Save profile"}
      </button>
    </>
  );
}
