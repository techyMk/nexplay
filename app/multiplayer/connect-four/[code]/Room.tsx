"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  applyDrop,
  C4_COLS,
  INITIAL_C4_STATE,
  type C4State,
} from "@/lib/connect-four";
import { Avatar } from "@/components/Avatar";
import { useConfirm } from "@/components/ConfirmDialog";

type Profile = { name: string; avatar: string };

type Initial = {
  hostUserId: string;
  guestUserId: string | null;
  state: C4State;
  status: "waiting" | "playing" | "finished";
  host: Profile | null;
  guest: Profile | null;
};

type RoomRow = {
  state: C4State;
  status: "waiting" | "playing" | "finished";
  guest_user_id: string | null;
};

type RealtimeStatus = "connecting" | "live" | "polling" | "error";

export function C4RoomClient({
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
  const [state, setState] = useState<C4State>(initial.state ?? INITIAL_C4_STATE);
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

  const guestUserIdRef = useRef(guestUserId);
  guestUserIdRef.current = guestUserId;
  const guestRef = useRef(guest);
  guestRef.current = guest;
  const lastEventAtRef = useRef<number>(Date.now());

  const applyRow = useCallback(
    async (row: RoomRow) => {
      lastEventAtRef.current = Date.now();
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
              avatar: data.avatar_emoji ?? "liam",
            });
        }
      }
    },
    [],
  );

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
        (payload) => applyRow(payload.new as RoomRow),
      )
      .subscribe((s) => {
        if (s === "SUBSCRIBED") setRtStatus("live");
        else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") setRtStatus("error");
        else if (s === "CLOSED") setRtStatus("polling");
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, applyRow]);

  // Polling fallback — also detects host-deleted rooms
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
      if (err) return;
      if (!data) {
        if (!closedNotice) {
          setClosedNotice("The host closed this room.");
          setTimeout(
            () => router.push("/multiplayer/connect-four"),
            2500,
          );
        }
        return;
      }
      applyRow(data as RoomRow);
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

  const myMark: 1 | 2 | null = useMemo(() => {
    if (myRole === "host") return 1;
    if (myRole === "guest") return 2;
    return null;
  }, [myRole]);

  const myTurn =
    status === "playing" && myMark !== null && state.turn === myMark && !state.winner;

  const drop = async (col: number) => {
    if (!myTurn || !myMark) return;
    if (state.board[0][col] !== 0) return;
    const next = applyDrop(state, myMark, col);
    if (!next) return;
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
    const fresh: C4State = {
      ...INITIAL_C4_STATE,
      board: INITIAL_C4_STATE.board.map((r) => [...r]),
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
      const freshState = {
        ...INITIAL_C4_STATE,
        board: INITIAL_C4_STATE.board.map((row) => [...row]),
      };
      const { error: err } = await supabase
        .from("rooms")
        .update({
          guest_user_id: null,
          status: "waiting",
          state: freshState,
        })
        .eq("id", roomId);
      if (err) {
        setError(`Couldn't leave: ${err.message}`);
        setClosing(false);
        return;
      }
    }
    router.push("/multiplayer/connect-four");
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const copyLink = async () => {
    try {
      const url = `${window.location.origin}/multiplayer/connect-four/${roomId}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
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

  const isWinCell = (r: number, c: number) =>
    state.winLine?.some(([wr, wc]) => wr === r && wc === c);

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
              onClick={copyCode}
              title="Copy room code"
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg bg-[var(--surface-2)] text-sm font-bold hover:bg-[var(--accent)] hover:text-white transition-colors"
            >
              📋
              <span className="hidden sm:inline">{copied ? "Copied ✓" : "Copy code"}</span>
            </button>
            <button
              onClick={copyLink}
              title="Copy invite link"
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg bg-[var(--surface-2)] text-sm font-bold hover:bg-[var(--accent)] hover:text-white transition-colors"
            >
              🔗
              <span className="hidden sm:inline">Copy link</span>
            </button>
            <button
              onClick={leaveRoom}
              disabled={closing}
              title={myRole === "host" ? "Close room" : "Leave room"}
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg bg-red-500/15 text-red-500 text-sm font-bold hover:bg-red-500 hover:text-white transition-colors disabled:opacity-50"
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
          color="red"
          mark="1"
          profile={host}
          isMe={myUserId === hostUserId}
          turn={status === "playing" && state.turn === 1 && !state.winner}
          waiting={false}
        />
        <PlayerCard
          color="amber"
          mark="2"
          profile={guest}
          isMe={guestUserId !== null && myUserId === guestUserId}
          turn={status === "playing" && state.turn === 2 && !state.winner}
          waiting={!guestUserId}
        />
      </div>

      {/* Status line */}
      <div className="text-center mb-3 h-7 text-sm">
        {status === "waiting" && (
          <span className="text-yellow-600">
            Waiting for an opponent. Share the room code to invite a friend.
          </span>
        )}
        {status === "playing" && !state.winner && (
          <span>
            {myTurn ? (
              <b>Your turn</b>
            ) : myRole === "spectator" ? (
              `${state.turn === 1 ? "🔴" : "🟡"}'s turn`
            ) : (
              `Waiting for ${state.turn === 1 ? "🔴" : "🟡"}…`
            )}
          </span>
        )}
        {state.winner === "draw" && (
          <span className="text-[var(--muted)]">It&apos;s a draw.</span>
        )}
        {state.winner === 1 && (
          <span className="text-emerald-500 font-bold">🏆 Red wins!</span>
        )}
        {state.winner === 2 && (
          <span className="text-emerald-500 font-bold">🏆 Yellow wins!</span>
        )}
        {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
      </div>

      {/* Board */}
      <div
        className="rounded-2xl p-3 bg-blue-700 mx-auto"
        style={{ width: "min(70vh, 92vw, 520px)" }}
      >
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: C4_COLS }).map((_, c) => (
            <button
              key={`btn-${c}`}
              onClick={() => drop(c)}
              disabled={!myTurn || state.board[0][c] !== 0}
              className="aspect-square rounded-full bg-black/30 hover:bg-white/20 disabled:opacity-40 transition-colors flex items-center justify-center text-white text-xl"
              aria-label={`Drop in column ${c + 1}`}
            >
              ↓
            </button>
          ))}
          {state.board.flatMap((row, r) =>
            row.map((v, c) => (
              <div
                key={`${r}-${c}`}
                className={`aspect-square rounded-full flex items-center justify-center transition-all ${
                  isWinCell(r, c) ? "ring-4 ring-white" : ""
                }`}
                style={{
                  background:
                    v === 1
                      ? "radial-gradient(circle at 30% 30%, #ff6666, #b91c1c)"
                      : v === 2
                        ? "radial-gradient(circle at 30% 30%, #ffe066, #ca8a04)"
                        : "rgba(0,0,0,0.5)",
                }}
              />
            )),
          )}
        </div>
      </div>

      {state.winner && myRole === "host" && (
        <div className="text-center mt-4">
          <button
            onClick={rematch}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] text-white font-bold hover:scale-105 transition-transform"
          >
            New round
          </button>
        </div>
      )}
      {state.winner && myRole === "guest" && (
        <div className="text-center mt-4 text-sm text-[var(--muted)]">
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
        <span className={`relative inline-flex rounded-full h-2 w-2 ${config.color}`} />
      </span>
      {config.label}
    </span>
  );
}

function PlayerCard({
  color,
  mark,
  profile,
  isMe,
  turn,
  waiting,
}: {
  color: "red" | "amber";
  mark: "1" | "2";
  profile: Profile | null;
  isMe: boolean;
  turn: boolean;
  waiting: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 transition-colors ${
        turn
          ? color === "red"
            ? "border-red-500 bg-red-500/10"
            : "border-amber-500 bg-amber-500/10"
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
          className={`w-7 h-7 rounded-full ${
            color === "red"
              ? "bg-gradient-to-br from-red-400 to-red-700"
              : "bg-gradient-to-br from-amber-300 to-amber-600"
          }`}
        />
      </div>
    </div>
  );
}
