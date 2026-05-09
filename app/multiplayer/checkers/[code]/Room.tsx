"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  C_SIZE,
  INITIAL_CHECKERS_STATE,
  applyMove,
  legalDestinations,
  legalMoves,
  type CheckersState,
  type Pos,
} from "@/lib/checkers";
import { Avatar } from "@/components/Avatar";
import { useConfirm } from "@/components/ConfirmDialog";

type Profile = { name: string; avatar: string };

type Initial = {
  hostUserId: string;
  guestUserId: string | null;
  state: CheckersState;
  status: "waiting" | "playing" | "finished";
  host: Profile | null;
  guest: Profile | null;
};

type RoomRow = {
  state: CheckersState;
  status: "waiting" | "playing" | "finished";
  guest_user_id: string | null;
};

type RealtimeStatus = "connecting" | "live" | "polling" | "error";

export function CheckersRoomClient({
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
  const [state, setState] = useState<CheckersState>(
    initial.state ?? INITIAL_CHECKERS_STATE,
  );
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
  const [selected, setSelected] = useState<Pos | null>(null);
  const router = useRouter();
  const confirm = useConfirm();

  const guestUserIdRef = useRef(guestUserId);
  guestUserIdRef.current = guestUserId;
  const guestRef = useRef(guest);
  guestRef.current = guest;
  const lastEventAtRef = useRef<number>(Date.now());

  const applyRow = useCallback(async (row: RoomRow) => {
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
  }, []);

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
          setTimeout(() => router.push("/multiplayer/checkers"), 2500);
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
    status === "playing" &&
    myMark !== null &&
    state.turn === myMark &&
    !state.winner;

  // When jumpChain becomes set, auto-select the chained piece for the player
  // whose turn it is (so destinations highlight without an extra click).
  useEffect(() => {
    if (state.jumpChain && myTurn) {
      setSelected(state.jumpChain);
    } else if (!myTurn) {
      setSelected(null);
    }
  }, [state.jumpChain, state.turn, myTurn]);

  // Reset selection if state arrives that no longer matches it
  useEffect(() => {
    if (selected) {
      const piece = state.board[selected[0]][selected[1]];
      if (!piece || piece.player !== myMark) setSelected(null);
    }
  }, [state.board, selected, myMark]);

  // Counts for the score cards
  const counts = useMemo(() => {
    let p1 = 0;
    let p2 = 0;
    for (let r = 0; r < C_SIZE; r++) {
      for (let c = 0; c < C_SIZE; c++) {
        const cell = state.board[r][c];
        if (cell?.player === 1) p1++;
        else if (cell?.player === 2) p2++;
      }
    }
    return { p1, p2 };
  }, [state.board]);

  // Destinations from the currently-selected piece (only if it's my turn)
  const destinations: Pos[] = useMemo(() => {
    if (!selected || !myMark) return [];
    return legalDestinations(state, myMark, selected).map((m) => m.to);
  }, [selected, state, myMark]);

  // Squares that have any legal piece to pick (mandatory captures only,
  // if any exist) — used to nudge the user.
  const movableFroms: Set<string> = useMemo(() => {
    if (!myMark) return new Set();
    const set = new Set<string>();
    for (const m of legalMoves(state, myMark)) {
      set.add(`${m.from[0]},${m.from[1]}`);
    }
    return set;
  }, [state, myMark]);

  const onSquareClick = async (r: number, c: number) => {
    if (!myTurn || !myMark) return;
    const cell = state.board[r][c];

    // Click a destination square — try to move
    if (selected) {
      const isDest = destinations.some(([dr, dc]) => dr === r && dc === c);
      if (isDest) {
        const next = applyMove(state, myMark, { from: selected, to: [r, c] });
        if (!next) return;
        setState(next);
        // If the chain continues, selection follows the piece automatically
        // via the useEffect above.
        const supabase = createClient();
        const { error: err } = await supabase
          .from("rooms")
          .update({
            state: next,
            status: next.winner ? "finished" : "playing",
          })
          .eq("id", roomId);
        if (err) setError(err.message);
        return;
      }
    }

    // During a jump chain, can't switch pieces
    if (state.jumpChain) return;

    // Otherwise: select / deselect a piece of mine
    if (cell && cell.player === myMark) {
      if (selected && selected[0] === r && selected[1] === c) {
        setSelected(null);
      } else {
        setSelected([r, c]);
      }
    } else {
      setSelected(null);
    }
  };

  const rematch = async () => {
    if (myRole !== "host") return;
    setError(null);
    const fresh: CheckersState = {
      ...INITIAL_CHECKERS_STATE,
      board: INITIAL_CHECKERS_STATE.board.map((row) => [...row]),
    };
    setState(fresh);
    setStatus(guestUserId ? "playing" : "waiting");
    setSelected(null);
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
      const freshState: CheckersState = {
        ...INITIAL_CHECKERS_STATE,
        board: INITIAL_CHECKERS_STATE.board.map((row) => [...row]),
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
    router.push("/multiplayer/checkers");
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
      const url = `${window.location.origin}/multiplayer/checkers/${roomId}`;
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

  const isLastMoveSquare = (r: number, c: number) => {
    const lm = state.lastMove;
    if (!lm) return false;
    return (
      (lm.from[0] === r && lm.from[1] === c) ||
      (lm.to[0] === r && lm.to[1] === c)
    );
  };

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
              className="px-4 py-2 rounded-lg bg-[var(--surface-2)] text-sm font-bold hover:bg-[var(--accent)] hover:text-white transition-colors"
            >
              {copied ? "Copied ✓" : "Copy code"}
            </button>
            <button
              onClick={copyLink}
              className="px-4 py-2 rounded-lg bg-[var(--surface-2)] text-sm font-bold hover:bg-[var(--accent)] hover:text-white transition-colors"
            >
              Copy link
            </button>
            <button
              onClick={leaveRoom}
              disabled={closing}
              className="px-4 py-2 rounded-lg bg-red-500/15 text-red-500 text-sm font-bold hover:bg-red-500 hover:text-white transition-colors disabled:opacity-50"
            >
              {closing
                ? "Closing…"
                : myRole === "host"
                  ? "Close room"
                  : "Leave"}
            </button>
          </div>
        </div>
      </div>

      {/* Players */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <PlayerCard
          color="red"
          remaining={counts.p1}
          captured={12 - counts.p2}
          profile={host}
          isMe={myUserId === hostUserId}
          turn={status === "playing" && state.turn === 1 && !state.winner}
          waiting={false}
        />
        <PlayerCard
          color="dark"
          remaining={counts.p2}
          captured={12 - counts.p1}
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
            {state.jumpChain && myTurn ? (
              <b>Keep jumping!</b>
            ) : myTurn ? (
              <b>Your turn</b>
            ) : myRole === "spectator" ? (
              `${state.turn === 1 ? "Red" : "Black"}'s turn`
            ) : (
              `Waiting for ${state.turn === 1 ? "Red" : "Black"}…`
            )}
          </span>
        )}
        {state.winner === 1 && (
          <span className="text-emerald-500 font-bold">🏆 Red wins!</span>
        )}
        {state.winner === 2 && (
          <span className="text-emerald-500 font-bold">🏆 Black wins!</span>
        )}
        {state.winner === "draw" && (
          <span className="text-[var(--muted)]">It&apos;s a draw.</span>
        )}
        {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
      </div>

      {/* Board */}
      <div
        className="rounded-2xl p-3 bg-stone-700 mx-auto"
        style={{ width: "min(70vh, 92vw, 560px)" }}
      >
        <div className="grid grid-cols-8 gap-0 rounded-lg overflow-hidden">
          {state.board.map((row, r) =>
            row.map((cell, c) => {
              const dark = (r + c) % 2 === 1;
              const isSelected =
                selected !== null && selected[0] === r && selected[1] === c;
              const isDest = destinations.some(
                ([dr, dc]) => dr === r && dc === c,
              );
              const canPick =
                myTurn && !state.jumpChain && movableFroms.has(`${r},${c}`);
              return (
                <button
                  key={`${r}-${c}`}
                  onClick={() => onSquareClick(r, c)}
                  disabled={!myTurn}
                  className={`relative aspect-square flex items-center justify-center transition-colors ${
                    dark ? "bg-stone-800" : "bg-amber-100"
                  } ${
                    isLastMoveSquare(r, c) ? "ring-2 ring-inset ring-yellow-400/60" : ""
                  } ${
                    isSelected ? "ring-4 ring-inset ring-cyan-400" : ""
                  } ${
                    canPick && !isSelected ? "hover:brightness-110" : ""
                  }`}
                  aria-label={`Square ${r + 1}, ${c + 1}`}
                >
                  {cell && (
                    <div
                      className={`relative rounded-full shadow-md ${
                        cell.player === 1
                          ? "bg-gradient-to-br from-red-400 to-red-700"
                          : "bg-gradient-to-br from-zinc-700 to-black"
                      }`}
                      style={{ width: "78%", height: "78%" }}
                    >
                      {cell.king && (
                        <span
                          className="absolute inset-0 flex items-center justify-center text-yellow-300"
                          style={{ fontSize: "60%" }}
                          aria-label="king"
                        >
                          ♛
                        </span>
                      )}
                      {canPick && !isSelected && (
                        <span className="absolute inset-0 rounded-full ring-2 ring-cyan-400/60" />
                      )}
                    </div>
                  )}
                  {isDest && (
                    <span
                      className="absolute rounded-full bg-emerald-400/70 pointer-events-none"
                      style={{ width: "30%", height: "30%" }}
                    />
                  )}
                </button>
              );
            }),
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
  remaining,
  captured,
  profile,
  isMe,
  turn,
  waiting,
}: {
  color: "red" | "dark";
  remaining: number;
  captured: number;
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
            : "border-zinc-500 bg-zinc-500/10"
          : "border-[var(--border)] bg-[var(--surface)]"
      }`}
    >
      <div className="flex items-center gap-3">
        <Avatar value={profile?.avatar ?? "❓"} size="md" />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-[var(--muted)]">
            {color === "red" ? "Red" : "Black"}
            {isMe && " — you"}
          </div>
          <div className="font-bold truncate">
            {waiting ? "Waiting…" : (profile?.name ?? "Player")}
          </div>
          <div className="text-[11px] text-[var(--muted)] mt-0.5">
            {remaining} pieces · {captured} captured
          </div>
        </div>
        <div
          className={`w-7 h-7 rounded-full ${
            color === "red"
              ? "bg-gradient-to-br from-red-400 to-red-700"
              : "bg-gradient-to-br from-zinc-700 to-black"
          }`}
        />
      </div>
    </div>
  );
}
