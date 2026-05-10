"use client";

import { useState } from "react";
import { useToast } from "@/components/ToastProvider";

const SUBJECT_MAX = 120;
const BODY_MAX = 4000;

export function FeedbackForm({ prefillEmail }: { prefillEmail: string }) {
  const toast = useToast();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [email, setEmail] = useState(prefillEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const canSubmit =
    !busy && subject.trim().length >= 2 && body.trim().length >= 5;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          body: body.trim(),
          email: email.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.error ?? `HTTP ${res.status}`);
      }
      setSubmitted(true);
      setSubject("");
      setBody("");
      toast({
        variant: "success",
        emoji: "✉️",
        title: "Feedback sent",
        description: "Thanks — we read every message.",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
        <div className="text-4xl mb-2">📨</div>
        <h2 className="text-xl font-black mb-1">Got it — thanks!</h2>
        <p className="text-sm text-[var(--muted)] mb-4">
          Your message landed. We&apos;ll take a look and follow up if it needs
          a reply.
        </p>
        <button
          type="button"
          onClick={() => setSubmitted(false)}
          className="px-4 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm font-bold hover:border-[var(--accent)]"
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4"
    >
      <Field
        label="Subject"
        hint={`${subject.length}/${SUBJECT_MAX}`}
      >
        <input
          type="text"
          value={subject}
          maxLength={SUBJECT_MAX}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. Tetris hard drop misfires"
          required
          className="w-full h-11 px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--accent)] focus:bg-[var(--surface)] focus:outline-none text-sm transition-colors"
        />
      </Field>

      <Field
        label="Message"
        hint={`${body.length}/${BODY_MAX}`}
      >
        <textarea
          value={body}
          maxLength={BODY_MAX}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Tell us what happened, what you expected, and where (which game / page)."
          rows={7}
          required
          className="w-full px-3 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--accent)] focus:bg-[var(--surface)] focus:outline-none text-sm transition-colors resize-y"
        />
      </Field>

      <Field
        label="Email"
        hint="Optional — only if you want a reply"
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full h-11 px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--accent)] focus:bg-[var(--surface)] focus:outline-none text-sm transition-colors"
        />
      </Field>

      {error && (
        <div className="text-sm text-red-600 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <p className="text-[11px] text-[var(--muted)]">
          By sending you agree we may store the message + your account info to
          follow up.
        </p>
        <button
          type="submit"
          disabled={!canSubmit}
          className="px-5 py-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] text-white text-sm font-bold disabled:opacity-50 hover:scale-[1.03] transition-transform"
        >
          {busy ? "Sending…" : "Send feedback"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs uppercase tracking-wider text-[var(--muted)] font-bold">
          {label}
        </span>
        {hint && <span className="text-[10px] text-[var(--muted-2)]">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
