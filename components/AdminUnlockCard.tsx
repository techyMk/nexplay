"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "./ConfirmDialog";
import { useToast } from "./ToastProvider";

const ADMIN_CONFIRM_PHRASE = "I AM ADMIN";

export function AdminUnlockCard({ alreadyUnlocked }: { alreadyUnlocked: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (alreadyUnlocked) {
    return (
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 mb-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">🔓</span>
          <div className="flex-1">
            <div className="font-black text-amber-700 dark:text-amber-300">
              Admin panel unlocked
            </div>
            <div className="text-xs text-[var(--muted)]">
              You have elevated access until you lock it or 8 hours pass.
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin"
            className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-bold hover:scale-105 transition-transform"
          >
            Open admin panel →
          </Link>
          <form action="/api/admin/lock" method="post">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-white/40 dark:bg-white/10 text-sm font-bold hover:bg-white/60 dark:hover:bg-white/20 transition-colors"
            >
              🔒 Lock
            </button>
          </form>
        </div>
      </div>
    );
  }

  const beginUnlock = async () => {
    const ok = await confirm({
      icon: "lucide:shield-check",
      title: "Unlock admin panel?",
      message:
        "Confirm you're the admin. This grants read access to every player's feedback, scores, and activity. You'll be asked to type a confirmation phrase next.",
      confirmText: "Yes, I am the admin",
    });
    if (!ok) return;
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phrase: phrase.trim() }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      toast({
        variant: "success",
        emoji: "🔓",
        title: "Admin unlocked",
        description: "Welcome to the control panel.",
      });
      router.push("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unlock failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--accent)]/40 bg-gradient-to-br from-[var(--accent)]/10 to-[var(--accent-2)]/10 p-5 mb-6">
      <div className="flex items-start gap-3 mb-3">
        <span className="text-2xl shrink-0">🛡️</span>
        <div className="flex-1 min-w-0">
          <div className="font-black">Admin access available</div>
          <div className="text-xs text-[var(--muted)] mt-0.5">
            This account is registered as the developer. Unlock the admin
            panel to view stats and feedback.
          </div>
        </div>
      </div>
      {!open ? (
        <button
          onClick={beginUnlock}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] text-white text-sm font-bold hover:scale-105 transition-transform"
        >
          🔓 Unlock admin panel
        </button>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-[var(--muted)] mb-1 font-bold">
              Type to confirm
            </div>
            <p className="text-xs text-[var(--muted)] mb-2">
              Type the phrase below exactly. Case doesn&apos;t matter.
            </p>
            <code className="block px-3 py-2 rounded-lg bg-[var(--surface-2)] text-sm font-mono mb-2 select-all">
              {ADMIN_CONFIRM_PHRASE}
            </code>
            <input
              type="text"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className="w-full h-11 px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--accent)] focus:bg-[var(--surface)] focus:outline-none text-sm font-mono transition-colors"
              placeholder={ADMIN_CONFIRM_PHRASE}
            />
          </div>
          {error && (
            <div className="text-sm text-red-600 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
              {error}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={
                busy ||
                phrase.trim().toLowerCase() !==
                  ADMIN_CONFIRM_PHRASE.toLowerCase()
              }
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] text-white text-sm font-bold disabled:opacity-50 hover:scale-105 transition-transform"
            >
              {busy ? "Unlocking…" : "Unlock"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setPhrase("");
                setError(null);
              }}
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-[var(--surface-2)] text-sm font-bold hover:bg-[var(--surface-3)] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
