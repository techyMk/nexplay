"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AVATARS } from "@/lib/avatars";
import { Avatar } from "./Avatar";

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
        <Avatar value={avatar} size="xl" />
        <div className="flex-1 min-w-0">
          <div className="text-xs text-[var(--muted)]">Signed in as</div>
          <div className="font-bold truncate">{initial.email}</div>
        </div>
      </div>

      <label className="block mb-4">
        <span className="text-xs uppercase tracking-wider text-[var(--muted)] block mb-1 font-bold">
          Display name
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={32}
          className="w-full h-11 px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--accent)] focus:bg-white focus:outline-none text-sm transition-colors"
        />
      </label>

      <div className="mb-5">
        <div className="text-xs uppercase tracking-wider text-[var(--muted)] mb-2 font-bold">
          Pick an avatar
        </div>
        <div className="grid grid-cols-6 gap-2">
          {AVATARS.map((a) => (
            <button
              key={a.slug}
              type="button"
              onClick={() => setAvatar(a.slug)}
              title={a.label}
              className={`relative aspect-square rounded-xl overflow-hidden ring-2 transition-all ${
                a.slug === avatar
                  ? "ring-[var(--accent)] scale-105"
                  : "ring-transparent hover:ring-[var(--border-strong)]"
              }`}
            >
              <Image
                src={a.src}
                alt={a.label}
                width={120}
                height={120}
                className="w-full h-full object-cover"
              />
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
