"use client";

/**
 * Chess room (multiplayer).
 *
 * Same overall shape as the Checkers room: each player subscribes
 * to postgres_changes on the rooms row, plus a 3s polling backup
 * for when Realtime stalls. Moves are applied locally, then the
 * full state is pushed to Supabase; the opponent's subscription
 * picks it up and applies via the same code path.
 *
 * Chess-specific bits:
 *  - State.pgn is the full game in PGN format; chess.js round-trips
 *    it so we always have the live position + history (needed for
 *    threefold-repetition / 50-move-rule detection).
 *  - Host plays white, guest plays black. The board renders from
 *    each player's own perspective (flipped for the guest).
 *  - Pawn promotion shows a four-piece menu before the move is
 *    actually committed.
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Move, type PieceSymbol, type Square } from "chess.js";
import { createClient } from "@/lib/supabase/client";
import {
  INITIAL_CHESS_STATE,
  type ChessOnlineState,
  type ChessOnlineWinner,
  type ChessOnlineReason,
} from "@/lib/chess-online";
import { Avatar } from "@/components/Avatar";
import { useConfirm } from "@/components/ConfirmDialog";

type Profile = { name: string; avatar: string };

type Initial = {
  hostUserId: string;
  guestUserId: string | null;
  state: ChessOnlineState;
  status: "waiting" | "playing" | "finished";
  host: Profile | null;
  guest: Profile | null;
};

type RoomRow = {
  state: ChessOnlineState;
  status: "waiting" | "playing" | "finished";
  guest_user_id: string | null;
};

type RealtimeStatus = "connecting" | "live" | "polling" | "error";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const PIECE_GLYPH: Record<PieceSymbol, string> = {
  k: "♚",
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
  p: "♟",
};

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

export function ChessRoomClient({
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
  const [state, setState] = useState<ChessOnlineState>(
    initial.state ?? INITIAL_CHESS_STATE,
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
  const [selected, setSelected] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: Square;
    to: Square;
  } | null>(null);
  const router = useRouter();
  const confirm = useConfirm();

  void myUserId; // currently unused; kept for future audit / chat / etc.

  const guestUserIdRef = useRef(guestUserId);
  guestUserIdRef.current = guestUserId;
  const guestRef = useRef(guest);
  guestRef.current = guest;
  const lastEventAtRef = useRef<number>(Date.now());

  // Hydrate a chess.js instance from the PGN every render. Cheap
  // (chess.js parses PGN in ~µs for any reasonable game length) and
  // keeps the live position + legal-move generation always in sync
  // with whatever the room's PGN says, regardless of who pushed it.
  const game = useMemo(() => {
    const g = new Chess();
    if (state.pgn) {
      try {
        g.loadPgn(state.pgn);
      } catch {
        // Bad PGN in the room — start fresh and log it. The next
        // move will overwrite the bad value.
        console.warn("[chess-room] could not load PGN:", state.pgn);
      }
    }
    return g;
  }, [state.pgn]);

  const board = game.board();
  const history = game.history({ verbose: true }) as Move[];
  const turn = game.turn();
  const inCheck = game.isCheck();

  const myColor: "w" | "b" | null =
    myRole === "host" ? "w" : myRole === "guest" ? "b" : null;
  const myTurn =
    status === "playing" && myColor !== null && turn === myColor && !state.winner;

  const applyRow = useCallback(async (row: RoomRow) => {
    lastEventAtRef.current = Date.now();
    setState(row.state ?? INITIAL_CHESS_STATE);
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

  // Subscribe to real-time updates on this row.
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
        else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT")
          setRtStatus("error");
        else if (s === "CLOSED") setRtStatus("polling");
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, applyRow]);

  // Backup polling so a flaky Realtime connection still converges.
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
          setTimeout(() => router.push("/multiplayer/chess"), 2500);
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

  // Helper: derive a fresh ChessOnlineState from a chess.js instance.
  // Pulls PGN + classifies the game outcome.
  const stateFromGame = useCallback((g: Chess): ChessOnlineState => {
    let winner: ChessOnlineWinner = null;
    let reason: ChessOnlineReason = null;
    let gameStatus: ChessOnlineState["status"] = "playing";
    if (g.isCheckmate()) {
      gameStatus = "finished";
      winner = g.turn() === "w" ? "b" : "w";
      reason = "checkmate";
    } else if (g.isStalemate()) {
      gameStatus = "finished";
      winner = "draw";
      reason = "stalemate";
    } else if (g.isThreefoldRepetition()) {
      gameStatus = "finished";
      winner = "draw";
      reason = "repetition";
    } else if (g.isInsufficientMaterial()) {
      gameStatus = "finished";
      winner = "draw";
      reason = "material";
    } else if (g.isDraw()) {
      gameStatus = "finished";
      winner = "draw";
      reason = "fifty";
    }
    return {
      pgn: g.pgn(),
      status: gameStatus,
      winner,
      reason,
    };
  }, []);

  // Make a move locally then push to Supabase.
  const pushMove = useCallback(
    async (from: Square, to: Square, promotion?: PieceSymbol) => {
      if (!myTurn) return;
      // Reconstruct a fresh chess.js from current PGN; mutating the
      // memoised `game` would race with re-renders.
      const g = new Chess();
      if (state.pgn) g.loadPgn(state.pgn);
      const move = g.move({ from, to, promotion });
      if (!move) {
        setError("Illegal move.");
        return;
      }
      const nextState = stateFromGame(g);
      // Making a move clears any outstanding draw offer — playing on
      // signals you'd rather keep going.
      nextState.drawOfferedBy = null;
      // Optimistic local update so the player sees their move
      // immediately, even before the server roundtrips.
      setState(nextState);
      setSelected(null);
      const supabase = createClient();
      const { error: err } = await supabase
        .from("rooms")
        .update({
          state: nextState,
          status: nextState.status === "finished" ? "finished" : "playing",
        })
        .eq("id", roomId);
      if (err) setError(err.message);
    },
    [myTurn, state.pgn, roomId, stateFromGame],
  );

  // ----- Draw offer / accept / decline -----
  const offerDraw = useCallback(async () => {
    if (!myColor || state.winner) return;
    const next: ChessOnlineState = {
      ...state,
      drawOfferedBy: myColor,
    };
    setState(next);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("rooms")
      .update({ state: next })
      .eq("id", roomId);
    if (err) setError(err.message);
  }, [myColor, state, roomId]);

  const cancelDrawOffer = useCallback(async () => {
    if (!myColor || state.drawOfferedBy !== myColor) return;
    const next: ChessOnlineState = { ...state, drawOfferedBy: null };
    setState(next);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("rooms")
      .update({ state: next })
      .eq("id", roomId);
    if (err) setError(err.message);
  }, [myColor, state, roomId]);

  const acceptDraw = useCallback(async () => {
    if (!myColor || !state.drawOfferedBy) return;
    if (state.drawOfferedBy === myColor) return; // can't accept your own
    const next: ChessOnlineState = {
      ...state,
      status: "finished",
      winner: "draw",
      reason: "agreement",
      drawOfferedBy: null,
    };
    setState(next);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("rooms")
      .update({ state: next, status: "finished" })
      .eq("id", roomId);
    if (err) setError(err.message);
  }, [myColor, state, roomId]);

  const declineDraw = useCallback(async () => {
    if (!myColor || !state.drawOfferedBy) return;
    if (state.drawOfferedBy === myColor) return;
    const next: ChessOnlineState = { ...state, drawOfferedBy: null };
    setState(next);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("rooms")
      .update({ state: next })
      .eq("id", roomId);
    if (err) setError(err.message);
  }, [myColor, state, roomId]);

  // Resign — set winner to opponent + push.
  const resign = useCallback(async () => {
    if (!myColor || state.winner) return;
    const ok = await confirm({
      icon: "lucide:flag",
      title: "Resign the game?",
      message: "Your opponent gets the win.",
      confirmText: "Resign",
      danger: true,
    });
    if (!ok) return;
    const next: ChessOnlineState = {
      pgn: state.pgn,
      status: "finished",
      winner: myColor === "w" ? "b" : "w",
      reason: "resign",
    };
    setState(next);
    const supabase = createClient();
    await supabase
      .from("rooms")
      .update({ state: next, status: "finished" })
      .eq("id", roomId);
  }, [myColor, state.winner, state.pgn, confirm, roomId]);

  // Host can offer a rematch — wipes the PGN back to empty.
  const rematch = useCallback(async () => {
    if (myRole !== "host") return;
    const fresh = { ...INITIAL_CHESS_STATE };
    setState(fresh);
    setStatus(guestUserId ? "playing" : "waiting");
    setSelected(null);
    setPendingPromotion(null);
    const supabase = createClient();
    await supabase
      .from("rooms")
      .update({
        state: fresh,
        status: guestUserId ? "playing" : "waiting",
      })
      .eq("id", roomId);
  }, [myRole, guestUserId, roomId]);

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
      const { error: err } = await supabase
        .from("rooms")
        .update({
          guest_user_id: null,
          status: "waiting",
          state: { ...INITIAL_CHESS_STATE },
        })
        .eq("id", roomId);
      if (err) {
        setError(`Couldn't leave: ${err.message}`);
        setClosing(false);
        return;
      }
    }
    router.push("/multiplayer/chess");
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard can throw in some browsers / contexts
    }
  };

  // Compute legal targets for the selected square.
  const legalFromSel: Move[] = useMemo(() => {
    if (!selected || !myColor) return [];
    return game.moves({ square: selected, verbose: true }) as Move[];
  }, [game, selected, myColor]);

  // Click handler
  function onSquareClick(sq: Square) {
    if (!myTurn || pendingPromotion) return;
    const target = legalFromSel.find((m) => m.to === sq);
    if (selected && target) {
      if (target.promotion) {
        setPendingPromotion({ from: selected, to: sq });
      } else {
        pushMove(selected, sq);
      }
      return;
    }
    const piece = game.get(sq);
    if (piece && piece.color === myColor) {
      setSelected(sq);
      return;
    }
    setSelected(null);
  }

  function resolvePromotion(piece: PieceSymbol) {
    if (!pendingPromotion) return;
    pushMove(pendingPromotion.from, pendingPromotion.to, piece);
    setPendingPromotion(null);
  }

  // Find the king's square if it's in check.
  let checkedKingSq: string | null = null;
  if (inCheck && !state.winner) {
    const colorInCheck = turn;
    outer: for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = board[r][c];
        if (sq && sq.type === "k" && sq.color === colorInCheck) {
          checkedKingSq = FILES[c] + (8 - r);
          break outer;
        }
      }
    }
  }

  // Captured-piece tally (each side's perspective).
  const capturedByWhite: PieceSymbol[] = [];
  const capturedByBlack: PieceSymbol[] = [];
  for (const m of history) {
    if (m.captured) {
      if (m.color === "w") capturedByWhite.push(m.captured);
      else capturedByBlack.push(m.captured);
    }
  }
  capturedByWhite.sort((a, b) => PIECE_VALUES[a] - PIECE_VALUES[b]);
  capturedByBlack.sort((a, b) => PIECE_VALUES[a] - PIECE_VALUES[b]);

  const lastMove =
    history.length > 0 ? history[history.length - 1] : null;
  // Render the board from the player's perspective. Spectators see
  // it from white's side.
  const flipped = myColor === "b";

  const movePairs: { num: number; white: Move; black?: Move }[] = [];
  for (let i = 0; i < history.length; i += 2) {
    movePairs.push({
      num: i / 2 + 1,
      white: history[i],
      black: history[i + 1],
    });
  }

  // ----- Render -----
  return (
    <div>
      {/* Top header — room code + status + leave */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-black">
            Room code
          </div>
          <button
            onClick={copyCode}
            className="text-2xl font-black font-mono tabular-nums inline-flex items-center gap-2 hover:text-[var(--accent)] transition-colors"
            title="Copy code"
          >
            {roomId}
            <span className="text-xs text-[var(--muted)]">
              {copied ? "✓ copied" : "📋"}
            </span>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <RealtimeBadge status={rtStatus} />
          <button
            onClick={leaveRoom}
            disabled={closing}
            className="px-3 py-1.5 rounded-lg bg-rose-500/15 border border-rose-400/30 text-rose-200 text-xs font-bold hover:bg-rose-500/25 transition-colors disabled:opacity-50"
          >
            {myRole === "host" ? "Close" : "Leave"}
          </button>
        </div>
      </div>

      {/* Player cards */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <PlayerCard
          color="w"
          profile={host}
          userId={hostUserId}
          isMe={myRole === "host"}
          turn={turn === "w" && status === "playing" && !state.winner}
          captured={capturedByWhite}
        />
        <PlayerCard
          color="b"
          profile={guest}
          userId={guestUserId}
          isMe={myRole === "guest"}
          turn={turn === "b" && status === "playing" && !state.winner}
          captured={capturedByBlack}
        />
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-rose-500/15 border border-rose-400/30 text-rose-200 text-xs">
          {error}
        </div>
      )}
      {closedNotice && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-amber-500/15 border border-amber-400/30 text-amber-200 text-xs">
          {closedNotice}
        </div>
      )}

      {status === "waiting" && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-sm text-center text-[var(--muted)]">
          Waiting for an opponent to join with this code…
        </div>
      )}

      {/* Board + side panel */}
      <div className="grid md:grid-cols-[1fr_320px] gap-4">
        <div className="flex justify-center">
          <div
            className="relative w-full"
            style={{ maxWidth: "min(70vh, 560px)" }}
          >
            <Board
              board={board}
              flipped={flipped}
              selected={selected}
              legalFromSel={legalFromSel}
              lastMove={lastMove}
              checkedKingSq={checkedKingSq}
              myTurn={myTurn}
              onSquareClick={onSquareClick}
            />
            {pendingPromotion && myColor && (
              <PromotionMenu
                color={myColor}
                onPick={resolvePromotion}
                onCancel={() => setPendingPromotion(null)}
              />
            )}
            {!myTurn && !state.winner && status === "playing" && (
              <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-md bg-black/65 text-white text-xs font-bold">
                Opponent&apos;s turn…
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 min-h-0">
          <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-3 text-xs">
            <div className="opacity-60 uppercase tracking-wider font-black text-[10px] mb-2">
              Status
            </div>
            {state.winner === null && (
              <div>
                <b>
                  {turn === "w" ? "White" : "Black"}
                </b>{" "}
                to move{inCheck ? " (in check)" : ""}.
              </div>
            )}
            {state.winner === "draw" && (
              <div>
                <b>Draw</b> — {readableReason(state.reason)}.
              </div>
            )}
            {(state.winner === "w" || state.winner === "b") && (
              <div>
                <b>{state.winner === "w" ? "White" : "Black"}</b> wins —{" "}
                {readableReason(state.reason)}.
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 rounded-xl bg-[var(--surface)] border border-[var(--border)] overflow-hidden flex flex-col">
            <div className="shrink-0 px-3 py-1.5 text-[10px] uppercase tracking-wider opacity-60 font-black border-b border-[var(--border)]">
              Move history
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar px-2 py-1 text-xs font-mono">
              {movePairs.length === 0 && (
                <div className="opacity-50 italic px-1 py-2">
                  No moves yet.
                </div>
              )}
              {movePairs.map((p) => (
                <div
                  key={p.num}
                  className="grid grid-cols-[28px_1fr_1fr] gap-1 py-0.5 hover:bg-black/5 dark:hover:bg-white/5 rounded px-1"
                >
                  <span className="opacity-40 text-right tabular-nums">
                    {p.num}.
                  </span>
                  <span>{p.white.san}</span>
                  <span>{p.black?.san ?? ""}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Draw offer surface — three possible states. Note that
              the underlying buttons are placed *outside* this block
              so they always render in their normal row; this banner
              is only the "an offer is on the table" alert. */}
          {state.drawOfferedBy && !state.winner && (
            <div className="rounded-xl bg-amber-500/15 border border-amber-400/40 px-3 py-2 text-xs">
              {state.drawOfferedBy === myColor ? (
                <div className="text-amber-200">
                  You offered a draw. Waiting for the opponent…
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="text-amber-100 font-bold">
                    🤝 Opponent offered a draw.
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={acceptDraw}
                      className="flex-1 px-3 py-1.5 rounded-md bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs font-bold hover:bg-emerald-500/30 transition-colors"
                    >
                      ✓ Accept
                    </button>
                    <button
                      onClick={declineDraw}
                      className="flex-1 px-3 py-1.5 rounded-md bg-rose-500/15 border border-rose-400/30 text-rose-200 text-xs font-bold hover:bg-rose-500/25 transition-colors"
                    >
                      ✗ Decline
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={resign}
              disabled={!myColor || !!state.winner || status !== "playing"}
              className="flex-1 px-3 py-2 rounded-lg bg-rose-500/15 border border-rose-400/30 text-rose-200 text-xs font-bold hover:bg-rose-500/25 transition-colors disabled:opacity-40"
            >
              🏳 Resign
            </button>
            {/* Draw button is contextual:
                  - I've offered: "Cancel draw offer"
                  - Opponent offered: hidden (we have Accept/Decline above)
                  - Nobody offered: "Offer draw" */}
            {state.drawOfferedBy === myColor ? (
              <button
                onClick={cancelDrawOffer}
                disabled={!myColor || !!state.winner}
                className="flex-1 px-3 py-2 rounded-lg bg-amber-500/15 border border-amber-400/30 text-amber-200 text-xs font-bold hover:bg-amber-500/25 transition-colors disabled:opacity-40"
              >
                ↺ Cancel offer
              </button>
            ) : (
              !state.drawOfferedBy && (
                <button
                  onClick={offerDraw}
                  disabled={
                    !myColor ||
                    !!state.winner ||
                    status !== "playing" ||
                    history.length === 0
                  }
                  className="flex-1 px-3 py-2 rounded-lg bg-amber-500/15 border border-amber-400/30 text-amber-200 text-xs font-bold hover:bg-amber-500/25 transition-colors disabled:opacity-40"
                  title="Propose a draw to your opponent"
                >
                  🤝 Offer draw
                </button>
              )
            )}
            {myRole === "host" && state.winner && (
              <button
                onClick={rematch}
                className="flex-1 px-3 py-2 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs font-bold hover:bg-emerald-500/30 transition-colors"
              >
                ↻ Rematch
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Board({
  board,
  flipped,
  selected,
  legalFromSel,
  lastMove,
  checkedKingSq,
  myTurn,
  onSquareClick,
}: {
  board: ReturnType<Chess["board"]>;
  flipped: boolean;
  selected: Square | null;
  legalFromSel: Move[];
  lastMove: Move | null;
  checkedKingSq: string | null;
  myTurn: boolean;
  onSquareClick: (sq: Square) => void;
}) {
  const rows = flipped ? [...board].reverse() : board;
  return (
    <div
      className={`w-full aspect-square grid grid-rows-8 grid-cols-8 rounded-lg overflow-hidden ring-2 ring-amber-900/40 shadow-2xl ${
        myTurn ? "" : "opacity-95"
      }`}
    >
      {rows.map((row, rIdx) => {
        const rowToRender = flipped ? [...row].reverse() : row;
        const realR = flipped ? 7 - rIdx : rIdx;
        return rowToRender.map((sq, cIdx) => {
          const realC = flipped ? 7 - cIdx : cIdx;
          const square = (FILES[realC] + (8 - realR)) as Square;
          const isLight = (realR + realC) % 2 === 0;
          const isSelected = selected === square;
          const target = legalFromSel.find((m) => m.to === square);
          const isLast =
            lastMove &&
            (lastMove.from === square || lastMove.to === square);
          const isChecked = checkedKingSq === square;

          let bg = isLight ? "bg-amber-100" : "bg-amber-800";
          if (isLast) bg = isLight ? "bg-yellow-300" : "bg-yellow-600";
          if (isSelected) bg = "bg-emerald-400";
          if (isChecked) bg = "bg-rose-500";

          return (
            <button
              key={square}
              onClick={() => onSquareClick(square)}
              className={`relative flex items-center justify-center transition-colors ${bg}`}
              aria-label={square}
            >
              {cIdx === 0 && (
                <span
                  className={`absolute top-0.5 left-1 text-[9px] font-bold ${
                    isLight ? "text-amber-900/60" : "text-amber-100/60"
                  }`}
                >
                  {8 - realR}
                </span>
              )}
              {rIdx === 7 && (
                <span
                  className={`absolute bottom-0.5 right-1 text-[9px] font-bold ${
                    isLight ? "text-amber-900/60" : "text-amber-100/60"
                  }`}
                >
                  {FILES[realC]}
                </span>
              )}
              {target && !target.captured && (
                <span className="absolute w-1/3 h-1/3 rounded-full bg-emerald-700/55 pointer-events-none" />
              )}
              {target && target.captured && (
                <span
                  className="absolute inset-1 rounded-full pointer-events-none"
                  style={{ boxShadow: "inset 0 0 0 4px rgba(16,185,129,0.6)" }}
                />
              )}
              {sq && (
                <span
                  className={`relative z-10 select-none ${
                    sq.color === "w"
                      ? "text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.6)]"
                      : "text-stone-900 drop-shadow-[0_1px_0_rgba(255,255,255,0.45)]"
                  }`}
                  style={{ fontSize: "min(7vw, 56px)", lineHeight: 1 }}
                >
                  {PIECE_GLYPH[sq.type]}
                </span>
              )}
            </button>
          );
        });
      })}
    </div>
  );
}

function PromotionMenu({
  color,
  onPick,
  onCancel,
}: {
  color: "w" | "b";
  onPick: (p: PieceSymbol) => void;
  onCancel: () => void;
}) {
  const pieces: PieceSymbol[] = ["q", "r", "b", "n"];
  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/65 backdrop-blur-sm rounded-lg"
      onClick={onCancel}
    >
      <div
        className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-xs uppercase tracking-wider opacity-70 font-bold mb-2 text-center">
          Promote pawn to
        </div>
        <div className="flex gap-2">
          {pieces.map((p) => (
            <button
              key={p}
              onClick={() => onPick(p)}
              className="w-14 h-14 rounded-lg bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 border border-[var(--border)] text-4xl flex items-center justify-center transition-colors"
              style={{
                color: color === "w" ? "white" : "#1c1917",
                textShadow:
                  color === "w"
                    ? "0 2px 2px rgba(0,0,0,0.6)"
                    : "0 1px 0 rgba(255,255,255,0.5)",
              }}
              title={p.toUpperCase()}
            >
              {PIECE_GLYPH[p]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PlayerCard({
  color,
  profile,
  userId,
  isMe,
  turn,
  captured,
}: {
  color: "w" | "b";
  profile: Profile | null;
  userId: string | null;
  isMe: boolean;
  turn: boolean;
  captured: PieceSymbol[];
}) {
  const name = profile?.name ?? (userId ? "Player" : "Waiting…");
  return (
    <div
      className={`rounded-2xl border p-3 transition-colors ${
        turn
          ? "border-emerald-400/50 bg-emerald-500/10"
          : "border-[var(--border)] bg-[var(--surface)]"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        {profile ? (
          <Avatar value={profile.avatar} size="xs" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-[var(--surface-2)]" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-lg">{color === "w" ? "♔" : "♚"}</span>
            <span className="truncate text-sm font-black">{name}</span>
            {isMe && (
              <span className="text-[10px] uppercase tracking-wider opacity-60">
                you
              </span>
            )}
          </div>
        </div>
        {turn && (
          <span className="text-[10px] uppercase tracking-wider text-emerald-300 font-black">
            • turn
          </span>
        )}
      </div>
      <div className="text-lg leading-none min-h-[1.2em] opacity-85">
        {captured.length === 0 ? (
          <span className="opacity-40 text-xs italic">No captures</span>
        ) : (
          captured.map((p, i) => <span key={i}>{PIECE_GLYPH[p]}</span>)
        )}
      </div>
    </div>
  );
}

function RealtimeBadge({ status }: { status: RealtimeStatus }) {
  const map: Record<
    RealtimeStatus,
    { dot: string; label: string; tone: string }
  > = {
    connecting: {
      dot: "bg-amber-400",
      label: "Connecting",
      tone: "text-amber-300",
    },
    live: { dot: "bg-emerald-400", label: "Live", tone: "text-emerald-300" },
    polling: {
      dot: "bg-amber-400 animate-pulse",
      label: "Polling",
      tone: "text-amber-300",
    },
    error: { dot: "bg-rose-500", label: "Reconnecting", tone: "text-rose-300" },
  };
  const x = map[status];
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/10 dark:bg-white/10 border border-[var(--border)] text-[10px] uppercase tracking-wider font-black">
      <span className={`w-1.5 h-1.5 rounded-full ${x.dot}`} />
      <span className={x.tone}>{x.label}</span>
    </span>
  );
}

function readableReason(reason: ChessOnlineReason): string {
  switch (reason) {
    case "checkmate":
      return "checkmate";
    case "stalemate":
      return "stalemate";
    case "resign":
      return "opponent resigned";
    case "agreement":
      return "draw by agreement";
    case "repetition":
      return "threefold repetition";
    case "material":
      return "insufficient material";
    case "fifty":
      return "50-move rule";
    default:
      return "draw";
  }
}
