"use client";

import { AnimatePresence, motion } from "framer-motion";
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

export type ConfirmOptions = {
  /** Headline of the dialog. Required. */
  title: string;
  /** Body copy below the title. */
  message?: string;
  /** Label of the affirm button. Defaults to "Confirm". */
  confirmText?: string;
  /** Label of the cancel button. Defaults to "Cancel". */
  cancelText?: string;
  /** Use the red destructive style for the confirm button. */
  danger?: boolean;
  /**
   * Optional Iconify icon name (e.g. "lucide:log-out"). Rendered as an
   * SVG via the Iconify CDN. Falls back to nothing if omitted.
   */
  icon?: string;
};

type Pending = {
  opts: ConfirmOptions;
  resolve: (ok: boolean) => void;
};

const ConfirmContext = createContext<
  ((opts: ConfirmOptions) => Promise<boolean>) | null
>(null);

/** Returns an async confirm() — resolves true when the user clicks confirm. */
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used inside <ConfirmProvider>");
  }
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [mounted, setMounted] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ opts, resolve });
    });
  }, []);

  const finish = useCallback(
    (ok: boolean) => {
      if (!pending) return;
      sound.play("click");
      pending.resolve(ok);
      setPending(null);
    },
    [pending],
  );

  // Close on Escape, focus the cancel button when the dialog opens.
  useEffect(() => {
    if (!pending) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish(false);
      if (e.key === "Enter") finish(true);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [pending, finish]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {pending && (
              <motion.div
                key="overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm"
                onClick={() => finish(false)}
              >
                <motion.div
                  key="card"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="confirm-title"
                  initial={{ opacity: 0, scale: 0.95, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, y: 4 }}
                  transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
                  className="relative w-full max-w-sm rounded-2xl bg-[var(--surface)] shadow-2xl border border-[var(--border)] overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Gradient strip at top */}
                  <div
                    className="h-1.5 w-full"
                    style={{
                      background: pending.opts.danger
                        ? "linear-gradient(90deg, #ef4444, #f97316)"
                        : "linear-gradient(90deg, var(--accent), var(--accent-2), var(--accent-3))",
                    }}
                  />

                  <div className="p-6">
                    {pending.opts.icon && (
                      <div
                        className={`mb-4 inline-flex items-center justify-center w-12 h-12 rounded-xl ${
                          pending.opts.danger
                            ? "bg-red-50 text-red-500"
                            : "bg-[var(--accent)]/10 text-[var(--accent)]"
                        }`}
                      >
                        <img
                          src={`https://api.iconify.design/${pending.opts.icon}.svg?color=${encodeURIComponent(
                            pending.opts.danger ? "#ef4444" : "#7c5cff",
                          )}`}
                          alt=""
                          width={24}
                          height={24}
                          className="w-6 h-6"
                        />
                      </div>
                    )}
                    <h2
                      id="confirm-title"
                      className="text-xl font-black tracking-tight mb-2"
                    >
                      {pending.opts.title}
                    </h2>
                    {pending.opts.message && (
                      <p className="text-sm text-[var(--muted)] leading-relaxed mb-5">
                        {pending.opts.message}
                      </p>
                    )}

                    <div className="flex gap-2 justify-end">
                      <button
                        ref={cancelRef}
                        type="button"
                        onClick={() => finish(false)}
                        className="px-4 py-2 rounded-lg bg-[var(--surface-2)] text-sm font-bold hover:bg-[var(--surface-3)] transition-colors"
                      >
                        {pending.opts.cancelText ?? "Cancel"}
                      </button>
                      <button
                        type="button"
                        onClick={() => finish(true)}
                        className={`px-4 py-2 rounded-lg text-white text-sm font-bold hover:scale-[1.02] transition-transform shadow-md ${
                          pending.opts.danger
                            ? "bg-gradient-to-r from-red-500 to-orange-500"
                            : "bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)]"
                        }`}
                        autoFocus={!pending.opts.danger}
                      >
                        {pending.opts.confirmText ?? "Confirm"}
                      </button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </ConfirmContext.Provider>
  );
}
