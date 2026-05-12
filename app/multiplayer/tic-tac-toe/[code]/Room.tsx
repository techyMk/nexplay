"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { applyMove, INITIAL_TTT_STATE, type TTTState } from "@/lib/multiplayer";
import { Avatar } from "@/components/Avatar";
import { useConfirm } from "@/components/ConfirmDialog";

type Profile = { name: string; avatar: string };

type Initial = {
  hostUserId: string;
  guestUserId: string | null;
  state: TTTState;
  status: "waiting" | "playing" | "finished";
  host: Profile | null;
  guest: Profile | null;
};

type RoomRow = {
  state: TTTState;
  status: "waiting" | "playing" | "finished";
  guest_user_id: string | null;
};

type RealtimeStatus = "connecting" | "live" | "polling" | "error";

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
  const [rtStatus, setRtStatus] = useState<RealtimeStatus>("connecting");
  const [closing, setClosing] = useState(false);
  const [closedNotice, setClosedNotice] = useState<string | null>(null);
  const router = useRouter();
  const confirm = useConfirm();

  // Refs so the realtime callback / polling can read latest values without
  // forcing a re-subscribe.
  const guestUserIdRef = useRef(guestUserId);
  guestUserIdRef.current = guestUserId;
  const guestRef = useRef(guest);
  guestRef.current = guest;
  const lastEventAtRef = useRef<number>(Date.now());

  // Apply a row update from either realtime or polling.
  const applyRow = useCallback(
    async (row: RoomRow, source: "realtime" | "poll") => {
      lastEventAtRef.current = Date.now();
      console.debug(`[room ${roomId}] update via ${source}`, row);
      setState(row.state);
      setStatus(row.status);
      if (row.guest_user_id !== guestUserIdRef.current) {
        setGuestUserId(row.guest_user_id);
        if (row.guest_user_id && !guestRef.current) {
          const supabase = createClient();
          const { data } = await supabase
            .from("profiles")
            .select("display_name, avatar_emoji")
            .eq("id", row.guest_user_id)
            .single();
          if (data)
            setGuest({
              name: data.display_name ?? "Player",
              avatar: data.avatar_emoji ?? "🎮",
            });
        }
      }
    },
    [roomId],
  );

  // Realtime: subscribe once per room.
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
          applyRow(payload.new as RoomRow, "realtime");
        },
      )
      .subscribe((s, err) => {
        console.debug(`[room ${roomId}] subscribe status: ${s}`, err);
        if (s === "SUBSCRIBED") setRtStatus("live");
        else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") setRtStatus("error");
        else if (s === "CLOSED") setRtStatus("polling");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, applyRow]);

  // Polling fallback: refetch every 3s. Cheap, and saves us if realtime
  // misses a beat (publication misconfig, browser sleep, etc.).
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const poll = async () => {
      const { data, error: err } = await supabase
        .from("rooms")
        .select("state, status, guest_user_id")
        .eq("id", roomId)
        .maybeSingle();
      if (cancelled) return;
      if (err) {
        console.warn(`[room ${roomId}] poll error`, err);
        return;
      }
      if (!data) {
        // Row no longer exists — host closed the room.
        if (!closedNotice) {
          setClosedNotice("The host closed this room.");
          setTimeout(() => router.push("/multiplayer/tic-tac-toe"), 2500);
        }
        return;
      }
      applyRow(data as RoomRow, "poll");
      if (Date.now() - lastEventAtRef.current > 6000 && rtStatus === "live") {
        setRtStatus("polling");
      }
    };

    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [roomId, applyRow, rtStatus, router, closedNotice]);

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

    // Optimistic update for snappy UI; realtime/polling will reconcile.
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

  const inProgress = status === "playing" && !state.winner;

  const leaveRoom = async () => {
    // Confirmation always — even on a finished/waiting room — and adapt
    // copy if there's an active game in progress.
    const ok = await confirm({
      icon: myRole === "host" ? "lucide:door-closed" : "lucide:log-out",
      title: myRole === "host" ? "Close room?" : "Leave room?",
      message: inProgress
        ? myRole === "host"
          ? "This ends the game for both players."
          : "Your spot will open for someone else to join."
        : myRole === "host"
          ? "The room will be deleted."
          : "You can rejoin via the room code later if it's still open.",
      confirmText: myRole === "host" ? "Close room" : "Leave",
      danger: true,
    });
    if (!ok) return;

    setClosing(true);
    const supabase = createClient();

    if (myRole === "host") {
      // Delete the room — RLS lets only the host do this.
      const { error: err } = await supabase
        .from("rooms")
        .delete()
        .eq("id", roomId);
      if (err) {
        setError(`Couldn't close room: ${err.message}`);
        setClosing(false);
        return;
      }
    } else if (myRole === "guest") {
      // Clear guest seat AND reset the board so the next guest doesn't
      // walk into a half-played match.
      const { error: err } = await supabase
        .from("rooms")
        .update({
          guest_user_id: null,
          status: "waiting",
          state: INITIAL_TTT_STATE,
        })
        .eq("id", roomId);
      if (err) {
        setError(`Couldn't leave: ${err.message}`);
        setClosing(false);
        return;
      }
    }
    // Spectators: no DB change, just navigate away.
    router.push("/multiplayer/tic-tac-toe");
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

  const copyLink = async () => {
    try {
      const url = `${window.location.origin}/multiplayer/tic-tac-toe/${roomId}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  if (closedNotice) {
    return (
      <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-8 text-center">
        <div className="text-4xl mb-3">🚪</div>
        <h2 className="text-xl font-bold mb-1">Room closed</h2>
        <p className="text-sm text-[var(--muted)]">
          {closedNotice} Returning to the lobby…
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Room header */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 mb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="text-xs uppercase tracking-wider text-[var(--muted)]">
                Room code
              </div>
              <RealtimeBadge status={rtStatus} />
            </div>
            <div className="font-mono text-3xl font-black tracking-[0.25em]">
              {roomId}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={copyCode}
              title="Copy room code"
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg bg-[var(--surface-2)] text-sm font-bold hover:bg-[var(--accent)] transition-colors"
            >
              📋
              <span className="hidden sm:inline">{copied ? "Copied ✓" : "Copy code"}</span>
            </button>
            <button
              type="button"
              onClick={copyLink}
              title="Copy invite link"
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg bg-[var(--surface-2)] text-sm font-bold hover:bg-[var(--accent)] transition-colors"
            >
              🔗
              <span className="hidden sm:inline">Copy link</span>
            </button>
            <button
              type="button"
              onClick={leaveRoom}
              disabled={closing}
              title={myRole === "host" ? "Close room" : "Leave room"}
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg bg-red-500/15 text-red-300 text-sm font-bold hover:bg-red-500 hover:text-white transition-colors disabled:opacity-50"
            >
              <span className="sm:hidden">✕</span>
              <span className="hidden sm:inline">
                {closing
                  ? "Closing…"
                  : myRole === "host"
                    ? "Close room"
                    : "Leave"}
              </span>
            </button>
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
      <div className="grid grid-cols-3 grid-rows-3 gap-2 max-w-md mx-auto aspect-square mb-4">
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

function RealtimeBadge({ status }: { status: RealtimeStatus }) {
  const config = {
    connecting: { label: "connecting", color: "bg-zinc-400", pulse: true },
    live: { label: "live", color: "bg-emerald-500", pulse: false },
    polling: { label: "polling", color: "bg-yellow-500", pulse: false },
    error: { label: "offline", color: "bg-red-500", pulse: false },
  }[status];

  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[var(--muted)] font-bold"
      title={`Realtime sync: ${config.label}`}
    >
      <span className="relative flex h-2 w-2">
        {config.pulse && (
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${config.color}`}
          />
        )}
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${config.color}`}
        />
      </span>
      {config.label}
    </span>
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
        <Avatar value={profile?.avatar ?? "❓"} size="md" />
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
