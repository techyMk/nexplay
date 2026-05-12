"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { useConfirm } from "./ConfirmDialog";

export function AuthMenuClient({
  displayName,
  avatar,
}: {
  displayName: string;
  avatar: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const confirm = useConfirm();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // The form is kept mounted at the root of this component (outside
  // the conditional dropdown) so that closing the dropdown before
  // the confirm dialog resolves doesn't unmount the form and null
  // out formRef.current. That bug made the header Log out silently
  // do nothing — the sidebar's LogoutRow worked only because the
  // sidebar is always mounted.
  const triggerLogout = async () => {
    setOpen(false);
    const ok = await confirm({
      icon: "lucide:log-out",
      title: "Log out?",
      message: "You can sign back in any time to keep saving scores.",
      confirmText: "Log out",
      danger: true,
    });
    if (ok) formRef.current?.submit();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--surface)] transition-colors"
      >
        <Avatar value={avatar} size="sm" />

        <span className="hidden sm:inline text-sm font-medium max-w-[120px] truncate">
          {displayName}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl shadow-black/40 overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <div className="text-xs text-[var(--muted)]">Logged in as</div>
            <div className="font-bold truncate">{displayName}</div>
          </div>
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm hover:bg-[var(--surface-2)] transition-colors"
          >
            Profile
          </Link>
          <button
            type="button"
            onClick={triggerLogout}
            className="block w-full text-left px-4 py-2.5 text-sm hover:bg-[var(--surface-2)] text-red-500 transition-colors"
          >
            Log out
          </button>
        </div>
      )}

      {/* Always-mounted form so the ref survives the dropdown closing
          before the confirm dialog resolves. Hidden because it has no
          children other than the implicit submit handler. */}
      <form
        ref={formRef}
        action="/logout"
        method="post"
        className="hidden"
        aria-hidden
      />
    </div>
  );
}
