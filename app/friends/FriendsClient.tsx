"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/Avatar";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  blockUser,
  inviteToPlay,
  respondToFriendRequest,
  sendFriendRequest,
  unblockUser,
  unfriend,
} from "./actions";

export type FriendRow = {
  user_id: string;
  display_name: string;
  avatar: string;
};

export type RequestRow = FriendRow;

export function FriendsClient({
  myUserId,
  friends,
  incoming,
  outgoing,
  blocked = [],
}: {
  myUserId: string;
  friends: FriendRow[];
  incoming: RequestRow[];
  outgoing: RequestRow[];
  blocked?: FriendRow[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [addInput, setAddInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  // Realtime presence
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("online_users", {
      config: { presence: { key: myUserId } },
    });
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setOnlineIds(new Set(Object.keys(state)));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ at: new Date().toISOString() });
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [myUserId]);

  // Refresh on friendships changes from other tabs/users
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`social:${myUserId}`)
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

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adding || !addInput.trim()) return;
    setAdding(true);
    setFeedback(null);
    const res = await sendFriendRequest(addInput);
    if (res.ok) {
      setFeedback({ kind: "ok", text: `Request sent to "${addInput.trim()}"` });
      setAddInput("");
    } else {
      setFeedback({ kind: "err", text: res.error });
    }
    setAdding(false);
  };

  const onRespond = async (otherId: string, accept: boolean) => {
    setBusy(otherId);
    await respondToFriendRequest(otherId, accept);
    setBusy(null);
  };

  const onUnfriend = async (row: FriendRow) => {
    const ok = await confirm({
      icon: "lucide:user-minus",
      title: `Remove ${row.display_name}?`,
      message: "You'll need to send a new request to be friends again.",
      confirmText: "Remove friend",
      danger: true,
    });
    if (!ok) return;
    setBusy(row.user_id);
    await unfriend(row.user_id);
    setBusy(null);
  };

  const onBlock = async (row: FriendRow) => {
    const ok = await confirm({
      icon: "lucide:ban",
      title: `Block ${row.display_name}?`,
      message:
        "They won't be able to send you friend requests or game invites. Any existing friendship is removed.",
      confirmText: "Block",
      danger: true,
    });
    if (!ok) return;
    setBusy(row.user_id);
    await blockUser(row.user_id);
    setBusy(null);
  };

  const onUnblock = async (row: FriendRow) => {
    setBusy(row.user_id);
    await unblockUser(row.user_id);
    setBusy(null);
  };

  const onInvite = async (row: FriendRow, gameSlug: "tic-tac-toe" | "skribbl") => {
    setBusy(row.user_id);
    const res = await inviteToPlay(row.user_id, gameSlug);
    setBusy(null);
    if (res.ok && res.roomId) {
      const path =
        gameSlug === "tic-tac-toe"
          ? `/multiplayer/tic-tac-toe/${res.roomId}`
          : `/multiplayer/skribbl/${res.roomId}`;
      router.push(path);
    } else if (!res.ok) {
      setFeedback({ kind: "err", text: res.error });
    }
  };

  return (
    <div className="space-y-6">
      {/* Add friend */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <div className="text-xs uppercase tracking-widest text-[var(--muted)] mb-2 font-bold">
          Add by username
        </div>
        <form onSubmit={onAdd} className="flex flex-col sm:flex-row gap-2">
          <input
            value={addInput}
            onChange={(e) => setAddInput(e.target.value)}
            placeholder="Manikandan"
            maxLength={32}
            className="flex-1 h-10 px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--accent)] focus:bg-[var(--surface)] focus:outline-none text-sm transition-colors"
          />
          <button
            type="submit"
            disabled={adding || !addInput.trim()}
            className="h-10 px-4 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] text-white text-sm font-bold disabled:opacity-50 hover:scale-[1.02] transition-transform shrink-0"
          >
            {adding ? "Sending…" : "Add friend"}
          </button>
        </form>
        {feedback && (
          <div
            className={`mt-3 text-xs px-3 py-2 rounded-lg ${
              feedback.kind === "ok"
                ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/30"
                : "bg-red-500/10 text-red-600 border border-red-500/30"
            }`}
          >
            {feedback.text}
          </div>
        )}
      </div>

      {/* Incoming requests */}
      {incoming.length > 0 && (
        <Section title={`Pending requests (${incoming.length})`} emoji="📬">
          {incoming.map((r) => (
            <Row key={r.user_id} row={r} online={onlineIds.has(r.user_id)}>
              <button
                onClick={() => onRespond(r.user_id, true)}
                disabled={busy === r.user_id}
                className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-bold hover:scale-105 transition-transform disabled:opacity-50"
              >
                Accept
              </button>
              <button
                onClick={() => onRespond(r.user_id, false)}
                disabled={busy === r.user_id}
                className="px-3 py-1.5 rounded-lg bg-[var(--surface-2)] text-[var(--muted)] text-xs font-bold hover:bg-[var(--surface-3)] transition-colors disabled:opacity-50"
              >
                Decline
              </button>
            </Row>
          ))}
        </Section>
      )}

      {/* Outgoing requests */}
      {outgoing.length > 0 && (
        <Section title={`Sent requests (${outgoing.length})`} emoji="📤">
          {outgoing.map((r) => (
            <Row key={r.user_id} row={r} online={onlineIds.has(r.user_id)}>
              <button
                onClick={() => onRespond(r.user_id, false)}
                disabled={busy === r.user_id}
                className="px-3 py-1.5 rounded-lg bg-[var(--surface-2)] text-[var(--muted)] text-xs font-bold hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </Row>
          ))}
        </Section>
      )}

      {/* Friends list */}
      <Section
        title={`Your friends (${friends.length})`}
        emoji="✨"
        empty={
          friends.length === 0 ? (
            <div className="text-sm text-[var(--muted)] text-center py-8">
              No friends yet. Share your username so others can find you.
            </div>
          ) : null
        }
      >
        {friends.map((r) => (
          <Row key={r.user_id} row={r} online={onlineIds.has(r.user_id)}>
            <FriendActions
              row={r}
              busy={busy === r.user_id}
              onInvite={onInvite}
              onUnfriend={onUnfriend}
              onBlock={onBlock}
            />
          </Row>
        ))}
      </Section>

      {/* Blocked users */}
      {blocked.length > 0 && (
        <Section title={`Blocked (${blocked.length})`} emoji="🚫">
          {blocked.map((r) => (
            <Row key={r.user_id} row={r} online={false}>
              <button
                onClick={() => onUnblock(r)}
                disabled={busy === r.user_id}
                className="px-3 py-1.5 rounded-lg bg-[var(--surface-2)] text-xs font-bold hover:bg-[var(--surface-3)] transition-colors disabled:opacity-50"
              >
                Unblock
              </button>
            </Row>
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  emoji,
  children,
  empty,
}: {
  title: string;
  emoji?: string;
  children?: React.ReactNode;
  empty?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2 px-1">
        {emoji && <span>{emoji}</span>}
        <h2 className="text-sm font-black uppercase tracking-wider">{title}</h2>
      </div>
      {empty ? (
        empty
      ) : (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
          {children}
        </div>
      )}
    </div>
  );
}

function Row({
  row,
  online,
  children,
}: {
  row: FriendRow;
  online: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 p-3">
      <div className="relative">
        <Avatar value={row.avatar} size="md" />
        {online && (
          <span
            className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[var(--surface)]"
            title="Online"
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold truncate">{row.display_name}</div>
        <div className="text-xs text-[var(--muted)]">
          {online ? "Online now" : "Offline"}
        </div>
      </div>
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  );
}

function FriendActions({
  row,
  busy,
  onInvite,
  onUnfriend,
  onBlock,
}: {
  row: FriendRow;
  busy: boolean;
  onInvite: (row: FriendRow, slug: "tic-tac-toe" | "skribbl") => void;
  onUnfriend: (row: FriendRow) => void;
  onBlock: (row: FriendRow) => void;
}) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setInviteOpen((v) => !v)}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] text-white text-xs font-bold hover:scale-105 transition-transform disabled:opacity-50"
        >
          ▶ Invite
        </button>
        {inviteOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setInviteOpen(false)}
              aria-hidden
            />
            <div className="absolute right-0 top-full mt-1 w-48 rounded-xl bg-[var(--surface)] shadow-2xl border border-[var(--border)] z-20 overflow-hidden">
              <button
                onClick={() => {
                  setInviteOpen(false);
                  onInvite(row, "tic-tac-toe");
                }}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-2)]"
              >
                ❌⭕ Tic-Tac-Toe
              </button>
              <button
                onClick={() => {
                  setInviteOpen(false);
                  onInvite(row, "skribbl");
                }}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-2)]"
              >
                🎨 Skribbl
              </button>
            </div>
          </>
        )}
      </div>
      <div className="relative">
        <button
          onClick={() => setMoreOpen((v) => !v)}
          disabled={busy}
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-[var(--surface-2)] text-[var(--muted)] hover:bg-[var(--surface-3)] hover:text-[var(--foreground)] transition-colors disabled:opacity-50"
          title="More"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="w-3.5 h-3.5"
            aria-hidden
          >
            <circle cx="12" cy="12" r="1" />
            <circle cx="19" cy="12" r="1" />
            <circle cx="5" cy="12" r="1" />
          </svg>
        </button>
        {moreOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setMoreOpen(false)}
              aria-hidden
            />
            <div className="absolute right-0 top-full mt-1 w-44 rounded-xl bg-[var(--surface)] shadow-2xl border border-[var(--border)] z-20 overflow-hidden">
              <button
                onClick={() => {
                  setMoreOpen(false);
                  onUnfriend(row);
                }}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-2)]"
              >
                Remove friend
              </button>
              <button
                onClick={() => {
                  setMoreOpen(false);
                  onBlock(row);
                }}
                className="block w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                Block user
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
