"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AVATARS, isCustomAvatarUrl } from "@/lib/avatars";
import { Avatar } from "./Avatar";
import { useToast } from "./ToastProvider";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB pre-resize cap
const TARGET_PX = 256;

/** Center-crop to a square and re-encode as webp (~256² @ q 0.85). */
async function processForUpload(file: File): Promise<Blob> {
  if (typeof createImageBitmap !== "function") {
    throw new Error("Your browser doesn't support image processing.");
  }
  const bitmap = await createImageBitmap(file);
  const minDim = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - minDim) / 2;
  const sy = (bitmap.height - minDim) / 2;
  const target = Math.min(TARGET_PX, minDim);
  const canvas = document.createElement("canvas");
  canvas.width = target;
  canvas.height = target;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D not available.");
  ctx.drawImage(bitmap, sx, sy, minDim, minDim, 0, 0, target, target);
  bitmap.close();
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to encode image."))),
      "image/webp",
      0.85,
    );
  });
}

export function ProfileEditor({
  initial,
}: {
  initial: { display_name: string; avatar_emoji: string; email: string };
}) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initial.display_name);
  const [avatar, setAvatar] = useState(initial.avatar_emoji);
  const [customUrl, setCustomUrl] = useState<string | null>(
    isCustomAvatarUrl(initial.avatar_emoji) ? initial.avatar_emoji : null,
  );
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPickFile = () => fileRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setError(null);

    if (file.size > MAX_UPLOAD_BYTES) {
      setError("Image is too large. Pick something under 5 MB.");
      return;
    }
    if (!/^image\//.test(file.type)) {
      setError("That doesn't look like an image.");
      return;
    }

    setUploading(true);
    try {
      const blob = await processForUpload(file);
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in to upload an avatar.");

      const path = `${user.id}/avatar-${Date.now()}.webp`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, blob, {
          contentType: "image/webp",
          cacheControl: "3600",
          upsert: false,
        });
      if (upErr) throw upErr;

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setCustomUrl(data.publicUrl);
      setAvatar(data.publicUrl);
      toast({
        variant: "success",
        emoji: "🖼️",
        title: "Image uploaded",
        description: "Click Save profile to apply your new avatar.",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed.";
      setError(message);
    } finally {
      setUploading(false);
    }
  };

  const removeUpload = () => {
    setCustomUrl(null);
    if (isCustomAvatarUrl(avatar)) setAvatar("liam");
  };

  const save = async () => {
    setBusy(true);
    setSaved(false);
    setError(null);
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setBusy(false);
      return;
    }
    const { error: upErr } = await supabase
      .from("profiles")
      .upsert({ id: u.user.id, display_name: name, avatar_emoji: avatar });
    setBusy(false);
    if (upErr) {
      setError(upErr.message);
      return;
    }
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
          className="w-full h-11 px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--accent)] focus:bg-[var(--surface)] focus:outline-none text-sm transition-colors"
        />
      </label>

      <div className="mb-5">
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-xs uppercase tracking-wider text-[var(--muted)] font-bold">
            Pick an avatar
          </div>
          <button
            type="button"
            onClick={onPickFile}
            disabled={uploading}
            className="text-xs text-[var(--accent)] hover:underline disabled:opacity-60"
          >
            {uploading ? "Uploading…" : customUrl ? "Replace upload" : "Upload your own →"}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={onFileChange}
          className="hidden"
        />
        <div className="grid grid-cols-6 gap-2">
          {customUrl && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setAvatar(customUrl)}
                title="Your upload"
                className={`relative aspect-square w-full rounded-xl overflow-hidden ring-2 transition-all ${
                  avatar === customUrl
                    ? "ring-[var(--accent)] scale-105"
                    : "ring-transparent hover:ring-[var(--border-strong)]"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={customUrl}
                  alt="Your upload"
                  className="w-full h-full object-cover"
                />
              </button>
              <button
                type="button"
                onClick={removeUpload}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[var(--muted)] hover:text-red-500 hover:border-red-500 flex items-center justify-center text-xs leading-none"
                title="Remove upload"
                aria-label="Remove upload"
              >
                ×
              </button>
            </div>
          )}
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
        <p className="mt-2 text-[11px] text-[var(--muted)]">
          PNG, JPG or WebP up to 5 MB. We center-crop to a 256×256 WebP so it
          loads fast.
        </p>
      </div>

      {error && (
        <div className="mb-3 text-sm text-red-600 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

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
