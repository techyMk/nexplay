"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { applyMove, INITIAL_TTT_STATE, type TTTState } from "@/lib/multiplayer";

type Profile = { name: string; avatar: string };

type Initial = {
  hostUserId: string;
  guestUserId: string | null;
  state: TTTState;
  status: "waiting" | "playing" | "finished";
  host: Profile | null;
  guest: Profile | null;
};

export function TTTRoomClient({
  roomId,
  myRole,
  myUserId,
  initial,
}: {
  roomId: string;
  myRole: "host" | "guest" | "spectator";
  myUserId: string;
  initial: Initial;
}) {
  const [state, setState] = useState<TTTState>(initial.state ?? INITIAL_TTT_STATE);
  const [status, setStatus] = useState(initial.status);
  const [hostUserId] = useState(initial.hostUserId);
  const [guestUserId, setGuestUserId] = useState(initial.guestUserId);
  const [host] = useState(initial.host);
  const [guest, setGuest] = useState(initial.guest);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Realtime subscription: listen for any UPDATE on this room
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          const row = payload.new as {
            state: TTTState;
            status: "waiting" | "playing" | "finished";
            guest_user_id: string | null;
          };
          setState(row.state);
          setStatus(row.status);
          if (row.guest_user_id !== guestUserId) {
            setGuestUserId(row.guest_user_id);
            // Re-fetch guest profile if a player just joined
            if (row.guest_user_id && !guest) {
              supabase
                .from("profiles")
                .select("display_name, avatar_emoji")
                .eq("id", row.guest_user_id)
                .single()
                .then(({ data }) => {
                  if (data)
                    setGuest({
                      name: data.display_name ?? "Player",
                      avatar: data.avatar_emoji ?? "🎮",
                    });
                });
            }
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, guestUserId, guest]);

  const myMark: "X" | "O" | null = useMemo(() => {
    if (myRole === "host") return "X";
    if (myRole === "guest") return "O";
    return null;
  }, [myRole]);

  const myTurn =
    status === "playing" && myMark !== null && state.turn === myMark && !state.winner;

  const click = async (i: number) => {
    if (!myTurn || !myMark) return;
    if (state.board[i]) return;
    const next = applyMove(state, myMark, i);
    if (!next) return;

    // Optimistic update for snappy UI; realtime will reconcile.
    setState(next);

    const supabase = createClient();
    const { error: err } = await supabase
      .from("rooms")
      .update({
        state: next,
        status: next.winner ? "finished" : "playing",
      })
      .eq("id", roomId);
    if (err) setError(err.message);
  };

  const rematch = async () => {
    if (myRole !== "host") return;
    setError(null);
    const fresh: TTTState = {
      board: Array<null>(9).fill(null),
      turn: "X",
      winner: null,
      winLine: null,
    };
    setState(fresh);
    setStatus(guestUserId ? "playing" : "waiting");
    const supabase = createClient();
    await supabase
      .from("rooms")
      .update({
        state: fresh,
        status: guestUserId ? "playing" : "waiting",
      })
      .eq("id", roomId);
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/multiplayer/tic-tac-toe/${roomId}`
      : "";

  return (
    <>
      {/* Room header */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 mb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-[var(--muted)]">
              Room code
            </div>
            <div className="font-mono text-3xl font-black tracking-[0.25em]">
              {roomId}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={copyCode}
              className="px-4 py-2 rounded-lg bg-[var(--surface-2)] text-sm font-bold hover:bg-[var(--accent)] transition-colors"
            >
              {copied ? "Copied ✓" : "Copy code"}
            </button>
            {shareUrl && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shareUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  } catch {}
                }}
                className="px-4 py-2 rounded-lg bg-[var(--surface-2)] text-sm font-bold hover:bg-[var(--accent)] transition-colors"
              >
                Copy link
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Players */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <PlayerCard
          mark="X"
          profile={host}
          isMe={myUserId === hostUserId}
          turn={status === "playing" && state.turn === "X"}
          waiting={false}
        />
        <PlayerCard
          mark="O"
          profile={guest}
          isMe={guestUserId !== null && myUserId === guestUserId}
          turn={status === "playing" && state.turn === "O"}
          waiting={!guestUserId}
        />
      </div>

      {/* Status */}
      <div className="text-center mb-3 h-7 text-sm">
        {status === "waiting" && (
          <span className="text-yellow-400">
            Waiting for an opponent. Share the room code to invite a friend.
          </span>
        )}
        {status === "playing" && !state.winner && (
          <span className="text-white">
            {myTurn ? (
              <b>Your turn</b>
            ) : myRole === "spectator" ? (
              `${state.turn}'s turn`
            ) : (
              `Waiting for ${state.turn === "X" ? "X" : "O"}…`
            )}
          </span>
        )}
        {state.winner === "draw" && (
          <span className="text-[var(--muted)]">It&apos;s a draw.</span>
        )}
        {state.winner && state.winner !== "draw" && (
          <span className="text-emerald-400 font-bold">
            🏆 {state.winner} wins!
          </span>
        )}
        {error && <div className="text-xs text-red-400 mt-1">{error}</div>}
      </div>

      {/* Board */}
      <div className="grid grid-cols-3 gap-2 max-w-md mx-auto aspect-square mb-4">
        {state.board.map((cell, i) => {
          const win = state.winLine?.includes(i);
          const playable = myTurn && !cell;
          return (
            <button
              key={i}
              onClick={() => click(i)}
              disabled={!playable}
              className={`rounded-2xl border-2 text-6xl md:text-7xl font-black flex items-center justify-center transition-all ${
                win
                  ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                  : "bg-[var(--surface)] border-[var(--border)] hover:border-[var(--accent)]/60 disabled:opacity-80 disabled:hover:border-[var(--border)]"
              }`}
              aria-label={`Cell ${i + 1}`}
            >
              {cell === "X" && <span className="text-[var(--accent)]">×</span>}
              {cell === "O" && <span className="text-[var(--accent-2)]">○</span>}
            </button>
          );
        })}
      </div>

      {/* Rematch — host only, after game ends */}
      {state.winner && myRole === "host" && (
        <div className="text-center">
          <button
            onClick={rematch}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] text-white font-bold hover:scale-105 transition-transform"
          >
            New round
          </button>
        </div>
      )}
      {state.winner && myRole === "guest" && (
        <div className="text-center text-sm text-[var(--muted)]">
          Waiting for the host to start a new round…
        </div>
      )}
    </>
  );
}

function PlayerCard({
  mark,
  profile,
  isMe,
  turn,
  waiting,
}: {
  mark: "X" | "O";
  profile: Profile | null;
  isMe: boolean;
  turn: boolean;
  waiting: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 transition-colors ${
        turn
          ? "border-[var(--accent)] bg-[var(--accent)]/10"
          : "border-[var(--border)] bg-[var(--surface)]"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex items-center justify-center text-2xl">
          {profile?.avatar ?? "❓"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-[var(--muted)]">
            Player {mark}
            {isMe && " — you"}
          </div>
          <div className="font-bold truncate">
            {waiting ? "Waiting…" : (profile?.name ?? "Player")}
          </div>
        </div>
        <div
          className={`text-3xl font-black ${
            mark === "X" ? "text-[var(--accent)]" : "text-[var(--accent-2)]"
          }`}
        >
          {mark}
        </div>
      </div>
    </div>
  );
}
