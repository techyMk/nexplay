"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { sound } from "@/lib/audio";

export type ToastVariant = "default" | "success" | "achievement" | "daily";

export type ToastInput = {
  title: string;
  description?: string;
  emoji?: string;
  variant?: ToastVariant;
  /** Auto-dismiss duration in ms. Defaults to 4500. */
  durationMs?: number;
  /** Optional CTA link rendered as a button under the description.
   *  Clicking it navigates and dismisses the toast. */
  action?: { label: string; href: string };
};

type Toast = ToastInput & { id: string; leaving?: boolean };

const ToastContext = createContext<((t: ToastInput) => void) | null>(null);

// Match the CSS keyframe duration in globals.css (.toast-leave).
const EXIT_MS = 180;

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);
  const exitTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  useEffect(() => {
    setMounted(true);
    return () => {
      exitTimers.current.forEach(clearTimeout);
      exitTimers.current.clear();
    };
  }, []);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = exitTimers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      exitTimers.current.delete(id);
    }
  }, []);

  // Trigger the leave animation, then remove after it completes.
  const dismiss = useCallback(
    (id: string) => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
      );
      const timer = setTimeout(() => remove(id), EXIT_MS);
      exitTimers.current.set(id, timer);
    },
    [remove],
  );

  const show = useCallback(
    (t: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev, { ...t, id }]);
      // Distinct sound per variant for a small dopamine hit
      if (t.variant === "achievement") sound.play("level");
      else if (t.variant === "daily" || t.variant === "success") sound.play("success");
      const dur = t.durationMs ?? 4500;
      setTimeout(() => dismiss(id), dur);
    },
    [dismiss],
  );

  const overlay = (
    <div
      className="pointer-events-none fixed top-4 right-4 z-[100] flex flex-col items-end gap-2 max-w-[calc(100vw-2rem)]"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto ${t.leaving ? "toast-leave" : "toast-enter"}`}
        >
          <ToastCard toast={t} onDismiss={() => dismiss(t.id)} />
        </div>
      ))}
    </div>
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      {mounted && createPortal(overlay, document.body)}
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const v = toast.variant ?? "default";
  const accent =
    v === "achievement"
      ? "from-amber-400 to-orange-500"
      : v === "daily"
        ? "from-emerald-400 to-cyan-500"
        : v === "success"
          ? "from-emerald-400 to-emerald-600"
          : "from-[var(--accent)] to-[var(--accent-2)]";
  const ring =
    v === "achievement"
      ? "ring-amber-400/40"
      : v === "daily"
        ? "ring-emerald-400/40"
        : v === "success"
          ? "ring-emerald-400/40"
          : "ring-[var(--accent)]/40";

  return (
    <div
      role="status"
      className={`relative flex items-start gap-3 min-w-[260px] max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl ring-1 ${ring} pl-3 pr-9 py-3 overflow-hidden`}
    >
      {/* Left accent stripe */}
      <span
        className={`absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b ${accent}`}
        aria-hidden
      />
      {toast.emoji && (
        <div
          className={`shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br ${accent} flex items-center justify-center text-lg shadow-md`}
          aria-hidden
        >
          {toast.emoji}
        </div>
      )}
      <div className="min-w-0 flex-1 py-0.5">
        <div className="text-sm font-black leading-tight">{toast.title}</div>
        {toast.description && (
          <div className="text-xs text-[var(--muted)] mt-0.5 leading-snug">
            {toast.description}
          </div>
        )}
        {toast.action && (
          <Link
            href={toast.action.href}
            onClick={onDismiss}
            className={`inline-flex items-center gap-1 mt-2 px-2.5 py-1 rounded-md bg-gradient-to-br ${accent} text-white text-[11px] font-black hover:scale-[1.03] transition-transform shadow`}
          >
            {toast.action.label} →
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)] transition-colors flex items-center justify-center"
        aria-label="Dismiss"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
          <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
