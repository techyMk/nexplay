"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useConfirm } from "./ConfirmDialog";

export type RecentRoom = {
  id: string;
  status: "waiting" | "playing" | "finished";
  created_at: string;
  host_user_id: string;
};

export function RecentRoomsList({
  rooms,
  myUserId,
}: {
  rooms: RecentRoom[];
  myUserId: string;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const confirmDialog = useConfirm();

  const cancel = async (roomId: string) => {
    const ok = await confirmDialog({
      icon: "lucide:trash-2",
      title: "Cancel room?",
      message: `Room ${roomId} will be deleted. Anyone with this code won't be able to join.`,
      confirmText: "Delete room",
      danger: true,
    });
    if (!ok) return;
    setPending(roomId);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.from("rooms").delete().eq("id", roomId);
    setPending(null);
    if (err) {
      setError(err.message);
      return;
    }
    setHidden((s) => new Set([...s, roomId]));
    router.refresh();
  };

  const visible = rooms.filter((r) => !hidden.has(r.id));
  if (visible.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-bold text-[var(--muted)] uppercase tracking-wider mb-2">
        Your recent rooms
      </h2>
      {error && (
        <div className="mb-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
          {error}
        </div>
      )}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
        {visible.map((r) => {
          const isHost = r.host_user_id === myUserId;
          const canCancel = isHost && r.status === "waiting";
          return (
            <div
              key={r.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-2)] transition-colors"
            >
              <Link
                href={`/multiplayer/tic-tac-toe/${r.id}`}
                className="flex items-center gap-3 flex-1 min-w-0"
              >
                <div className="font-mono text-lg font-bold tracking-wider">
                  {r.id}
                </div>
                <div
                  className={`text-xs px-2 py-0.5 rounded-md font-medium uppercase tracking-wider ${
                    r.status === "playing"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : r.status === "finished"
                        ? "bg-zinc-500/20 text-zinc-400"
                        : "bg-yellow-500/20 text-yellow-400"
                  }`}
                >
                  {r.status}
                </div>
                {isHost && (
                  <span className="text-[10px] text-[var(--muted)] uppercase tracking-wider">
                    host
                  </span>
                )}
                <div className="ml-auto text-xs text-[var(--muted)]">
                  {new Date(r.created_at).toLocaleString()}
                </div>
              </Link>
              {canCancel && (
                <button
                  type="button"
                  onClick={() => cancel(r.id)}
                  disabled={pending === r.id}
                  className="text-xs px-3 py-1.5 rounded-lg bg-red-500/15 text-red-300 font-bold hover:bg-red-500 hover:text-white transition-colors disabled:opacity-50"
                  title="Cancel this room"
                >
                  {pending === r.id ? "…" : "Cancel"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
