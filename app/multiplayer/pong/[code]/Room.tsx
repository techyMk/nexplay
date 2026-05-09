"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  BALL_R,
  FIELD_H,
  INITIAL_PONG_STATE,
  PADDLE_H,
  PADDLE_W,
  PADDLE_X,
  TICK_HZ,
  PADDLE_SEND_HZ,
  clampPaddle,
  freshSnapshot,
  step,
  type PongState,
  type Snapshot,
} from "@/lib/pong";
import { Avatar } from "@/components/Avatar";
import { useConfirm } from "@/components/ConfirmDialog";

type Profile = { name: string; avatar: string };

type Initial = {
  hostUserId: string;
  guestUserId: string | null;
  state: PongState;
  status: "waiting" | "playing" | "finished";
  host: Profile | null;
  guest: Profile | null;
};

type RoomRow = {
  state: PongState;
  status: "waiting" | "playing" | "finished";
  guest_user_id: string | null;
};

type RealtimeStatus = "connecting" | "live" | "polling" | "error";

const TICK_DT = 1 / TICK_HZ;
const PADDLE_SEND_INTERVAL_MS = 1000 / PADDLE_SEND_HZ;
const POINT_PAUSE_MS = 800;

export function PongRoomClient({
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
  const [pongState, setPongState] = useState<PongState>(initial.state);
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

  // Snapshot lives in a ref so the physics loop doesn't trigger React renders.
  const snapRef = useRef<Snapshot>(freshSnapshot(2));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const pauseUntilRef = useRef<number>(0);
  const guestUserIdRef = useRef(guestUserId);
  guestUserIdRef.current = guestUserId;
  const guestRef = useRef(guest);
  guestRef.current = guest;
  const statusRef = useRef(status);
  statusRef.current = status;
  const stateRef = useRef(pongState);
  stateRef.current = pongState;
  const lastEventAtRef = useRef<number>(Date.now());

  const myMark: 1 | 2 | null = useMemo(() => {
    if (myRole === "host") return 1;
    if (myRole === "guest") return 2;
    return null;
  }, [myRole]);

  // Apply DB row updates (status, scores, winner, guest join)
  const applyRow = useCallback(async (row: RoomRow) => {
    lastEventAtRef.current = Date.now();
    setPongState(row.state);
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

  // Postgres-changes for room row
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`pong-room:${roomId}`)
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
          setTimeout(() => router.push("/multiplayer/pong"), 2500);
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

  // Live broadcast channel for snapshots + paddle inputs
  useEffect(() => {
    if (myRole === "spectator") return;
    const supabase = createClient();
    const channel = supabase.channel(`pong-live:${roomId}`, {
      config: { broadcast: { self: false } },
    });

    channel.on("broadcast", { event: "snap" }, ({ payload }) => {
      if (myRole === "host") return; // host is authoritative
      const s = payload as Snapshot;
      // Preserve our own paddle pos so the local feel stays smooth
      const myPaddle = snapRef.current.pr;
      snapRef.current = { ...s, pr: myPaddle };
    });

    channel.on("broadcast", { event: "paddle" }, ({ payload }) => {
      const { side, y } = payload as { side: "L" | "R"; y: number };
      if (myRole === "host" && side === "R") {
        snapRef.current = { ...snapRef.current, pr: clampPaddle(y) };
      } else if (myRole === "guest" && side === "L") {
        snapRef.current = { ...snapRef.current, pl: clampPaddle(y) };
      }
    });

    channel.subscribe();
    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [roomId, myRole]);

  // Handle a point being scored — only the host writes.
  const handleScore = useCallback(
    async (pointFor: 1 | 2) => {
      if (myRole !== "host") return;
      const cur = stateRef.current;
      const scoreL = cur.scoreL + (pointFor === 1 ? 1 : 0);
      const scoreR = cur.scoreR + (pointFor === 2 ? 1 : 0);
      const winner: 1 | 2 | null =
        scoreL >= cur.target ? 1 : scoreR >= cur.target ? 2 : null;
      const next: PongState = { ...cur, scoreL, scoreR, winner };

      // Reset ball, serving the side that lost the point
      snapRef.current = {
        ...freshSnapshot(pointFor === 1 ? 2 : 1),
        pl: snapRef.current.pl,
        pr: snapRef.current.pr,
      };
      pauseUntilRef.current = performance.now() + POINT_PAUSE_MS;

      const supabase = createClient();
      await supabase
        .from("rooms")
        .update({
          state: next,
          status: winner ? "finished" : "playing",
        })
        .eq("id", roomId);
    },
    [myRole, roomId],
  );

  // Physics + render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let lastT = performance.now();
    let acc = 0;
    let lastSnap = 0;

    const sizeCanvas = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    sizeCanvas();
    const ro = new ResizeObserver(sizeCanvas);
    if (wrapRef.current) ro.observe(wrapRef.current);

    const loop = (t: number) => {
      const dt = Math.min((t - lastT) / 1000, 0.05);
      lastT = t;

      const isHost = myRole === "host";
      const playing =
        statusRef.current === "playing" &&
        !stateRef.current.winner &&
        guestUserIdRef.current !== null &&
        t >= pauseUntilRef.current;

      if (isHost && playing) {
        acc += dt;
        // Fixed-step physics for stability
        while (acc >= TICK_DT) {
          const result = step(snapRef.current, TICK_DT);
          snapRef.current = result.next;
          acc -= TICK_DT;
          if (result.pointFor) {
            void handleScore(result.pointFor);
            acc = 0;
            break;
          }
        }
        // Throttle snapshot broadcast to ~30Hz
        if (t - lastSnap > 1000 / TICK_HZ) {
          channelRef.current
            ?.send({ type: "broadcast", event: "snap", payload: snapRef.current })
            .catch(() => {});
          lastSnap = t;
        }
      }

      // Render
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const fieldH = w * (FIELD_H / 1); // FIELD_W = 1, so px-per-unit = w
      // Center vertical scaling: keep aspect 1 : FIELD_H
      // The wrapper enforces the aspect ratio, so h ≈ w * FIELD_H.
      void fieldH;

      ctx.clearRect(0, 0, w, h);

      // Backdrop
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, "#0b1220");
      grad.addColorStop(1, "#1e1b4b");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Center dashed line
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(w / 2, 6);
      ctx.lineTo(w / 2, h - 6);
      ctx.stroke();
      ctx.setLineDash([]);

      const s = snapRef.current;
      // px-per-unit is `w` (since FIELD_W = 1). y also scales by w because
      // the wrapper's height is exactly w * FIELD_H.
      const px = (u: number) => u * w;

      // Left paddle
      ctx.fillStyle = "#22d3ee"; // cyan
      ctx.fillRect(
        px(PADDLE_X),
        px(s.pl - PADDLE_H / 2),
        px(PADDLE_W),
        px(PADDLE_H),
      );
      // Right paddle
      ctx.fillStyle = "#f472b6"; // pink
      ctx.fillRect(
        px(1 - PADDLE_X - PADDLE_W),
        px(s.pr - PADDLE_H / 2),
        px(PADDLE_W),
        px(PADDLE_H),
      );

      // Ball
      ctx.fillStyle = "#fafafa";
      ctx.beginPath();
      ctx.arc(px(s.bx), px(s.by), px(BALL_R), 0, Math.PI * 2);
      ctx.fill();

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [myRole, handleScore]);

  // Reset snapshot when a fresh round starts (status flips back to playing
  // with both scores 0, e.g. after rematch). Both sides reset locally so
  // the guest doesn't carry over a stale paddle/ball position from the
  // previous match before the host's first broadcast lands.
  useEffect(() => {
    if (
      myRole !== "spectator" &&
      status === "playing" &&
      pongState.scoreL === 0 &&
      pongState.scoreR === 0 &&
      !pongState.winner
    ) {
      snapRef.current = freshSnapshot(Math.random() < 0.5 ? 1 : 2);
    }
  }, [myRole, status, pongState.scoreL, pongState.scoreR, pongState.winner]);

  // Paddle input — keyboard + pointer
  useEffect(() => {
    if (myRole === "spectator") return;
    const wrap = wrapRef.current;
    if (!wrap) return;

    let pressedUp = false;
    let pressedDown = false;
    let lastSent = 0;

    const setMyPaddle = (y: number) => {
      const clamped = clampPaddle(y);
      if (myRole === "host") {
        snapRef.current = { ...snapRef.current, pl: clamped };
      } else {
        snapRef.current = { ...snapRef.current, pr: clamped };
      }
      const now = performance.now();
      if (now - lastSent > PADDLE_SEND_INTERVAL_MS) {
        channelRef.current
          ?.send({
            type: "broadcast",
            event: "paddle",
            payload: { side: myRole === "host" ? "L" : "R", y: clamped },
          })
          .catch(() => {});
        lastSent = now;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
        pressedUp = true;
        e.preventDefault();
      }
      if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
        pressedDown = true;
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") pressedUp = false;
      if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") pressedDown = false;
    };

    let kbRaf = 0;
    let lastKbT = performance.now();
    const kbLoop = (t: number) => {
      const dt = Math.min((t - lastKbT) / 1000, 0.05);
      lastKbT = t;
      if (pressedUp || pressedDown) {
        const cur = myRole === "host" ? snapRef.current.pl : snapRef.current.pr;
        const speed = 0.9; // units/sec
        const dy = (pressedDown ? 1 : 0) - (pressedUp ? 1 : 0);
        setMyPaddle(cur + dy * speed * dt);
      }
      kbRaf = requestAnimationFrame(kbLoop);
    };
    kbRaf = requestAnimationFrame(kbLoop);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const onPointerMove = (e: PointerEvent) => {
      if (e.pressure === 0 && e.pointerType === "mouse" && e.buttons === 0) {
        // For mouse, follow pointer regardless of button state.
      }
      const rect = wrap.getBoundingClientRect();
      const yPx = e.clientY - rect.top;
      const yUnit = (yPx / rect.height) * FIELD_H;
      setMyPaddle(yUnit);
    };
    const onPointerDown = (e: PointerEvent) => {
      (wrap as HTMLElement).setPointerCapture(e.pointerId);
      onPointerMove(e);
    };
    const onPointerUp = (e: PointerEvent) => {
      try {
        (wrap as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    };

    wrap.addEventListener("pointermove", onPointerMove);
    wrap.addEventListener("pointerdown", onPointerDown);
    wrap.addEventListener("pointerup", onPointerUp);

    return () => {
      cancelAnimationFrame(kbRaf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      wrap.removeEventListener("pointermove", onPointerMove);
      wrap.removeEventListener("pointerdown", onPointerDown);
      wrap.removeEventListener("pointerup", onPointerUp);
    };
  }, [myRole]);

  const rematch = async () => {
    if (myRole !== "host") return;
    setError(null);
    snapRef.current = freshSnapshot(Math.random() < 0.5 ? 1 : 2);
    pauseUntilRef.current = performance.now() + POINT_PAUSE_MS;
    const fresh: PongState = {
      scoreL: 0,
      scoreR: 0,
      winner: null,
      target: pongState.target,
    };
    setPongState(fresh);
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

  const inProgress = status === "playing" && !pongState.winner;

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
      // Clear guest seat AND reset scores so the next guest doesn't
      // walk into a half-played match.
      const { error: err } = await supabase
        .from("rooms")
        .update({
          guest_user_id: null,
          status: "waiting",
          state: { ...INITIAL_PONG_STATE, target: pongState.target },
        })
        .eq("id", roomId);
      if (err) {
        setError(`Couldn't leave: ${err.message}`);
        setClosing(false);
        return;
      }
    }
    router.push("/multiplayer/pong");
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
      const url = `${window.location.origin}/multiplayer/pong/${roomId}`;
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
          color="cyan"
          score={pongState.scoreL}
          profile={host}
          isMe={myUserId === hostUserId}
          waiting={false}
        />
        <PlayerCard
          color="pink"
          score={pongState.scoreR}
          profile={guest}
          isMe={guestUserId !== null && myUserId === guestUserId}
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
        {status === "playing" && !pongState.winner && (
          <span className="text-[var(--muted)]">
            First to {pongState.target} wins · Move with{" "}
            <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--foreground)] text-xs font-mono">
              ↑↓
            </kbd>{" "}
            or drag
          </span>
        )}
        {pongState.winner === 1 && (
          <span className="text-emerald-500 font-bold">🏆 Cyan wins!</span>
        )}
        {pongState.winner === 2 && (
          <span className="text-emerald-500 font-bold">🏆 Pink wins!</span>
        )}
        {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
      </div>

      {/* Field */}
      <div
        ref={wrapRef}
        className="rounded-2xl overflow-hidden mx-auto touch-none select-none cursor-pointer relative"
        style={{
          width: "min(80vh, 92vw, 720px)",
          aspectRatio: `${1} / ${FIELD_H}`,
        }}
      >
        <canvas ref={canvasRef} className="block w-full h-full" />
      </div>

      {pongState.winner && myRole === "host" && (
        <div className="text-center mt-4">
          <button
            onClick={rematch}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] text-white font-bold hover:scale-105 transition-transform"
          >
            New round
          </button>
        </div>
      )}
      {pongState.winner && myRole === "guest" && (
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
  score,
  profile,
  isMe,
  waiting,
}: {
  color: "cyan" | "pink";
  score: number;
  profile: Profile | null;
  isMe: boolean;
  waiting: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center gap-3">
        <Avatar value={profile?.avatar ?? "❓"} size="md" />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-[var(--muted)]">
            {color === "cyan" ? "Cyan" : "Pink"}
            {isMe && " — you"}
          </div>
          <div className="font-bold truncate">
            {waiting ? "Waiting…" : (profile?.name ?? "Player")}
          </div>
        </div>
        <div
          className={`text-3xl font-black ${
            color === "cyan" ? "text-cyan-400" : "text-pink-400"
          }`}
        >
          {score}
        </div>
      </div>
    </div>
  );
}
