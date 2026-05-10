"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "./ConfirmDialog";
import { useToast } from "./ToastProvider";

type Phase = "idle" | "sending" | "awaiting" | "verifying";

export function AdminUnlockCard({ alreadyUnlocked }: { alreadyUnlocked: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>("idle");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const codeInputRef = useRef<HTMLInputElement | null>(null);

  // Resend cooldown ticks down once a minute after a successful "start".
  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  // Auto-focus the code box when we move to "awaiting".
  useEffect(() => {
    if (phase === "awaiting") codeInputRef.current?.focus();
  }, [phase]);

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
              Elevated access for the next 4 hours, or until you lock it.
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

  const sendCode = async () => {
    setPhase("sending");
    setError(null);
    try {
      const res = await fetch("/api/admin/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setPhase("awaiting");
      setResendIn(60);
      toast({
        variant: "success",
        emoji: "✉️",
        title: "Code sent",
        description: "Check your admin inbox for the numeric code.",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send code");
      setPhase("idle");
    }
  };

  const beginUnlock = async () => {
    const ok = await confirm({
      icon: "lucide:shield-check",
      title: "Unlock admin panel?",
      message:
        "We'll email a one-time code to the admin address. Enter it on the next screen to unlock — your session alone isn't enough.",
      confirmText: "Send code",
    });
    if (!ok) return;
    await sendCode();
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6,10}$/.test(code.trim())) {
      setError("Enter the full numeric code from the email.");
      return;
    }
    setPhase("verifying");
    setError(null);
    try {
      const res = await fetch("/api/admin/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", token: code.trim() }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      toast({
        variant: "success",
        emoji: "🔓",
        title: "Admin unlocked",
        description: "Welcome to the control panel.",
      });
      router.push("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
      setPhase("awaiting");
    }
  };

  const cancel = () => {
    setPhase("idle");
    setCode("");
    setError(null);
    setResendIn(0);
  };

  return (
    <div className="rounded-2xl border border-[var(--accent)]/40 bg-gradient-to-br from-[var(--accent)]/10 to-[var(--accent-2)]/10 p-5 mb-6">
      <div className="flex items-start gap-3 mb-3">
        <span className="text-2xl shrink-0">🛡️</span>
        <div className="flex-1 min-w-0">
          <div className="font-black">Admin access available</div>
          <div className="text-xs text-[var(--muted)] mt-0.5">
            This account is registered as the developer. Unlock requires a
            one-time code emailed to the admin address.
          </div>
        </div>
      </div>

      {phase === "idle" && (
        <button
          onClick={beginUnlock}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] text-white text-sm font-bold hover:scale-105 transition-transform"
        >
          🔓 Unlock admin panel
        </button>
      )}

      {phase === "sending" && (
        <div className="text-sm text-[var(--muted)]">
          Sending code…
        </div>
      )}

      {(phase === "awaiting" || phase === "verifying") && (
        <form onSubmit={verify} className="space-y-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-[var(--muted)] mb-1 font-bold">
              Enter the code from the email
            </div>
            <p className="text-xs text-[var(--muted)] mb-2">
              We just emailed a numeric code to the admin inbox. Length depends
              on your Supabase OTP setting (typically 6–8 digits). Codes expire
              in a few minutes.
            </p>
            <input
              ref={codeInputRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6,10}"
              maxLength={10}
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 10))
              }
              spellCheck={false}
              className="w-full max-w-[18rem] h-12 px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--accent)] focus:bg-[var(--surface)] focus:outline-none text-2xl font-mono tracking-[0.3em] text-center transition-colors"
              placeholder="••••••"
              disabled={phase === "verifying"}
            />
          </div>
          {error && (
            <div className="text-sm text-red-600 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
              {error}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={phase === "verifying" || !/^\d{6,10}$/.test(code.trim())}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] text-white text-sm font-bold disabled:opacity-50 hover:scale-105 transition-transform"
            >
              {phase === "verifying" ? "Verifying…" : "Unlock"}
            </button>
            <button
              type="button"
              onClick={sendCode}
              disabled={resendIn > 0 || phase === "verifying"}
              className="px-4 py-2 rounded-lg bg-[var(--surface-2)] text-sm font-bold hover:bg-[var(--surface-3)] transition-colors disabled:opacity-50"
            >
              {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={phase === "verifying"}
              className="px-4 py-2 rounded-lg bg-white/5 text-[var(--muted)] text-sm font-bold hover:text-[var(--foreground)] hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {phase === "idle" && error && (
        <div className="mt-3 text-sm text-red-600 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
          {error}
        </div>
      )}
    </div>
  );
}
