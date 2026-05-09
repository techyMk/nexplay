"use client";

import { useEffect, useState } from "react";
import { useSound } from "@/lib/useSound";
import { useConfirm } from "@/components/ConfirmDialog";

export function SettingsClient() {
  const { play, muted, setMuted } = useSound();
  const confirm = useConfirm();
  const [reset, setReset] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Clear any feedback after a few seconds
  useEffect(() => {
    if (!reset) return;
    const id = setTimeout(() => setReset(null), 3000);
    return () => clearTimeout(id);
  }, [reset]);

  const onMuteToggle = () => {
    setMuted(!muted);
    if (muted) play("click"); // play once when un-muting so user hears it
  };

  const clearLocal = async () => {
    const ok = await confirm({
      icon: "lucide:trash-2",
      title: "Clear local data?",
      message:
        "Removes 'recently played', best scores stored in this browser, and other client-only state. Your account, friends and saved scores on the leaderboards stay intact.",
      confirmText: "Clear local data",
      danger: true,
    });
    if (!ok) return;
    try {
      const keys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith("nexplay:")) keys.push(k);
      }
      // Keep mute preference — it's on settings, the user just set it
      keys
        .filter((k) => k !== "nexplay:muted")
        .forEach((k) => window.localStorage.removeItem(k));
      window.dispatchEvent(new Event("nexplay:recently-played-updated"));
      setReset({ kind: "ok", text: `Cleared ${keys.length - (keys.includes("nexplay:muted") ? 1 : 0)} local items.` });
    } catch (e) {
      setReset({ kind: "err", text: e instanceof Error ? e.message : "Failed" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Sound */}
      <Section title="Sound" emoji="🔊">
        <ToggleRow
          label="Sound effects"
          description="Short clicks, pops and chimes during gameplay."
          checked={!muted}
          onChange={onMuteToggle}
          previewLabel={muted ? "Off" : "Preview"}
          onPreview={() => {
            play("success");
          }}
        />
      </Section>

      {/* Theme — placeholder for future */}
      <Section title="Appearance" emoji="🎨">
        <Row
          label="Theme"
          description="Light theme is currently the only option. Dark mode coming soon."
          right={
            <span className="px-2.5 py-1 rounded-md bg-[var(--surface-2)] text-xs font-bold">
              Light
            </span>
          }
        />
      </Section>

      {/* Local data */}
      <Section title="Browser data" emoji="🗂️">
        <Row
          label="Clear local data"
          description="Wipes your local 'recently played' list and per-device best scores. Server-side data (account, friends, leaderboards) is untouched."
          right={
            <button
              onClick={clearLocal}
              className="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-600 text-xs font-bold hover:bg-red-500 hover:text-white transition-colors"
            >
              Clear
            </button>
          }
        />
        {reset && (
          <div
            className={`mt-3 text-xs px-3 py-2 rounded-lg ${
              reset.kind === "ok"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {reset.text}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  emoji,
  children,
}: {
  title: string;
  emoji?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-baseline gap-2 mb-3">
        {emoji && <span>{emoji}</span>}
        <h2 className="text-sm font-black uppercase tracking-wider">{title}</h2>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({
  label,
  description,
  right,
}: {
  label: string;
  description?: string;
  right: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold">{label}</div>
        {description && (
          <div className="text-xs text-[var(--muted)] mt-0.5 leading-relaxed">
            {description}
          </div>
        )}
      </div>
      <div className="shrink-0">{right}</div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  previewLabel,
  onPreview,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
  previewLabel?: string;
  onPreview?: () => void;
}) {
  return (
    <Row
      label={label}
      description={description}
      right={
        <div className="flex items-center gap-2">
          {onPreview && checked && (
            <button
              onClick={onPreview}
              className="px-2 py-1 rounded-md bg-[var(--surface-2)] text-xs font-bold hover:bg-[var(--accent)] hover:text-white transition-colors"
            >
              {previewLabel}
            </button>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={onChange}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              checked
                ? "bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)]"
                : "bg-[var(--surface-3)]"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                checked ? "translate-x-5" : ""
              }`}
            />
          </button>
        </div>
      }
    />
  );
}
