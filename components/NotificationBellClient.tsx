"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "./Avatar";
import { respondToFriendRequest, respondToInvite } from "@/app/friends/actions";

export type NotificationData = {
  requests: { otherId: string; display_name: string; avatar: string }[];
  invites: {
    id: string;
    from_user: string;
    display_name: string;
    avatar: string;
    game_slug: string;
  }[];
};

export function NotificationBellClient({
  initial,
  myUserId,
}: {
  initial: NotificationData;
  myUserId: string;
}) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Refresh on social events
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifs:${myUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_invites" },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [myUserId, router]);

  useEffect(() => setData(initial), [initial]);

  // Close on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const total = data.requests.length + data.invites.length;

  const acceptRequest = async (otherId: string) => {
    await respondToFriendRequest(otherId, true);
  };
  const declineRequest = async (otherId: string) => {
    await respondToFriendRequest(otherId, false);
  };
  const acceptInvite = async (id: string) => {
    const res = await respondToInvite(id, true);
    setOpen(false);
    if (res.ok && res.redirectTo) router.push(res.redirectTo);
  };
  const declineInvite = async (id: string) => {
    await respondToInvite(id, false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[var(--surface-2)] transition-colors"
        aria-label="Notifications"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5 text-[var(--muted)]"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--accent-2)] text-white text-[10px] font-black flex items-center justify-center">
            {total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--border)] bg-white shadow-2xl overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
            <span className="text-sm font-black">Notifications</span>
            {total > 0 && (
              <span className="text-xs text-[var(--muted)]">{total} new</span>
            )}
          </div>

          {total === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--muted)]">
              <div className="text-3xl mb-2">🌱</div>
              All caught up
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              {data.invites.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-[10px] uppercase tracking-widest text-[var(--muted-2)] font-bold bg-[var(--surface-2)]">
                    Game invites
                  </div>
                  {data.invites.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-2)]"
                    >
                      <Avatar value={inv.avatar} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">
                          <b>{inv.display_name}</b> invited you to{" "}
                          <b>{prettySlug(inv.game_slug)}</b>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => acceptInvite(inv.id)}
                          className="px-2.5 py-1 rounded-md bg-emerald-500 text-white text-[11px] font-bold hover:scale-105 transition-transform"
                        >
                          Join
                        </button>
                        <button
                          onClick={() => declineInvite(inv.id)}
                          className="px-2.5 py-1 rounded-md bg-[var(--surface-3)] text-[var(--muted)] text-[11px] font-bold hover:bg-red-50 hover:text-red-600 transition-colors"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {data.requests.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-[10px] uppercase tracking-widest text-[var(--muted-2)] font-bold bg-[var(--surface-2)]">
                    Friend requests
                  </div>
                  {data.requests.map((r) => (
                    <div
                      key={r.otherId}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-2)]"
                    >
                      <Avatar value={r.avatar} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">
                          <b>{r.display_name}</b>{" "}
                          <span className="text-[var(--muted)]">
                            wants to be friends
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => acceptRequest(r.otherId)}
                          className="px-2.5 py-1 rounded-md bg-emerald-500 text-white text-[11px] font-bold hover:scale-105 transition-transform"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => declineRequest(r.otherId)}
                          className="px-2.5 py-1 rounded-md bg-[var(--surface-3)] text-[var(--muted)] text-[11px] font-bold hover:bg-red-50 hover:text-red-600 transition-colors"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <Link
            href="/friends"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-xs text-center font-bold text-[var(--accent)] hover:bg-[var(--accent)]/10 border-t border-[var(--border)]"
          >
            Manage friends →
          </Link>
        </div>
      )}
    </div>
  );
}

function prettySlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join("-");
}
