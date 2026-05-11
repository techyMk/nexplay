"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { isCorrectGuess, maskWord, pickWordChoices } from "@/lib/skribbl/words";
import {
  type Phase,
  type Player,
  type SkribblState,
  pointsForGuess,
} from "@/lib/skribbl/state";
import { DrawingCanvas } from "@/components/skribbl/DrawingCanvas";
import { Avatar } from "@/components/Avatar";
import { SoundToggle } from "@/components/SoundToggle";
import { Sfx } from "@/lib/sound";

type ChatMessage = {
  id: string;
  user_id: string;
  display_name: string;
  avatar: string;
  text: string;
  is_correct?: boolean;
  is_system?: boolean;
};

const DRAW_SECONDS = 60;

export function SkribblRoomClient({
  roomId,
  myUserId,
  isHost,
  isParticipant,
  initialState,
  initialStatus,
}: {
  roomId: string;
  myUserId: string;
  isHost: boolean;
  isParticipant: boolean;
  initialState: SkribblState;
  initialStatus: "lobby" | "playing" | "finished";
}) {
  const router = useRouter();
  const [state, setState] = useState<SkribblState>(initialState);
  const [roomStatus, setRoomStatus] = useState(initialStatus);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [closedNotice, setClosedNotice] = useState<string | null>(null);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const guessedThisRound = useRef(false);

  const me = state.players.find((p) => p.user_id === myUserId);
  const isDrawer = state.drawer_id === myUserId;
  const phase = state.phase;
  const wordToShow = isDrawer ? state.word : null;

  // ---------- Sound cues ----------
  // Phase transitions: ding when a new round starts, soft thud when
  // a round ends, win flourish when the whole game is finished.
  useEffect(() => {
    if (phase === "drawing") Sfx.pickup();
    else if (phase === "round_end") Sfx.thud();
    else if (phase === "finished") Sfx.win();
  }, [phase]);

  // Track the last chat-message id we played a "correct guess" tick
  // for, so the same message doesn't re-trigger on every re-render.
  const lastCorrectChatIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (chat.length === 0) return;
    const last = chat[chat.length - 1];
    if (!last.is_correct) return;
    if (last.id === lastCorrectChatIdRef.current) return;
    lastCorrectChatIdRef.current = last.id;
    // Don't double-play if I'm the guesser (sendChat already played
    // Sfx.match locally).
    if (last.user_id === myUserId) return;
    Sfx.bigPickup();
  }, [chat, myUserId]);

  // ---------- Channel: postgres_changes + broadcast (chat / strokes) ----------
  useEffect(() => {
    const ch = supabase.channel(`skribbl:${roomId}`, {
      config: { broadcast: { self: false } },
    });

    ch.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "skribbl_rooms",
        filter: `id=eq.${roomId}`,
      },
      (payload) => {
        const row = payload.new as {
          state: SkribblState;
          status: "lobby" | "playing" | "finished";
        };
        setState(row.state);
        setRoomStatus(row.status);
      },
    );

    ch.on(
      "broadcast",
      { event: "chat" },
      (payload: { event: string; payload: ChatMessage }) => {
        setChat((c) => [...c, payload.payload].slice(-100));
      },
    );

    ch.subscribe((s) => console.debug(`[skribbl ${roomId}] ${s}`));

    setChannel(ch);
    return () => {
      supabase.removeChannel(ch);
    };
  }, [roomId, supabase]);

  // ---------- Polling fallback ----------
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const { data, error: err } = await supabase
        .from("skribbl_rooms")
        .select("state, status")
        .eq("id", roomId)
        .maybeSingle();
      if (cancelled) return;
      if (err) return;
      if (!data) {
        if (!closedNotice) {
          setClosedNotice("The host closed this room.");
          setTimeout(() => router.push("/multiplayer/skribbl"), 2500);
        }
        return;
      }
      setState(data.state as SkribblState);
      setRoomStatus(data.status as "lobby" | "playing" | "finished");
    };
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [roomId, supabase, router, closedNotice]);

  // ---------- Tick ----------
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // ---------- Reset round-tracking refs when drawer changes ----------
  useEffect(() => {
    guessedThisRound.current = false;
    setChat([]);
  }, [state.drawer_id, state.round]);

  const secondsLeft = state.round_ends_at
    ? Math.max(0, Math.ceil((new Date(state.round_ends_at).getTime() - now) / 1000))
    : 0;

  // Time warning — when the clock just hit 10s during a drawing phase,
  // play a brief urgency tick. Gated on `=== 10` so it fires once per
  // round instead of every frame below 10.
  useEffect(() => {
    if (phase === "drawing" && secondsLeft === 10) {
      Sfx.error();
    }
  }, [phase, secondsLeft]);

  // ---------- Helpers to mutate state on the server ----------
  const updateState = useCallback(
    async (next: Partial<SkribblState>, status?: "lobby" | "playing" | "finished") => {
      const merged: SkribblState = { ...state, ...next };
      setState(merged);
      if (status) setRoomStatus(status);
      const { error: err } = await supabase
        .from("skribbl_rooms")
        .update({
          state: merged,
          ...(status ? { status } : {}),
        })
        .eq("id", roomId);
      if (err) setError(err.message);
    },
    [state, supabase, roomId],
  );

  // Auto-end round when timer hits zero (only the drawer triggers it, to
  // avoid race conditions).
  useEffect(() => {
    if (phase !== "drawing" || !isDrawer) return;
    if (secondsLeft > 0) return;
    endRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isDrawer, secondsLeft]);

  // Auto-end round as soon as every non-drawer has guessed correctly.
  // Drawer triggers it so we have a single writer and avoid duplicate
  // round_end transitions.
  useEffect(() => {
    if (phase !== "drawing" || !isDrawer) return;
    const nonDrawers = state.players.length - 1;
    if (nonDrawers <= 0) return;
    if (state.guessers.length >= nonDrawers) {
      endRound();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isDrawer, state.guessers.length, state.players.length]);

  // ---------- Game flow ----------
  const startGame = async () => {
    if (!isHost) return;
    if (state.players.length < 2) {
      setError("Need at least 2 players to start.");
      return;
    }
    const order = state.players.map((p) => p.user_id);
    // Shuffle
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const max_rounds = state.players.length; // one round per drawer
    const draw_seconds = DRAW_SECONDS;
    await updateState(
      {
        phase: "choosing",
        round: 1,
        max_rounds,
        draw_seconds,
        drawer_order: order,
        drawer_index: 0,
        drawer_id: order[0],
        word_choices: pickWordChoices(3),
        word: null,
        word_pattern: "",
        round_ends_at: null,
        guessers: [],
      },
      "playing",
    );
  };

  const chooseWord = async (word: string) => {
    if (!isDrawer) return;
    const round_ends_at = new Date(Date.now() + state.draw_seconds * 1000).toISOString();
    await updateState({
      phase: "drawing",
      word,
      word_pattern: maskWord(word),
      round_ends_at,
      guessers: [],
    });
    // Wipe any leftover canvas content for everyone via broadcast clear
    channel?.send({ type: "broadcast", event: "draw", payload: { type: "clear" } });
  };

  const endRound = async () => {
    // Award drawer points = average of guessers' points
    const drawerBonus =
      state.guessers.length > 0
        ? Math.round(
            state.guessers.reduce((s, g) => s + g.points, 0) / state.guessers.length,
          )
        : 0;

    const players: Player[] = state.players.map((p) =>
      p.user_id === state.drawer_id ? { ...p, score: p.score + drawerBonus } : p,
    );

    // System message for word reveal — broadcast for everyone, including self
    if (channel) {
      channel.send({
        type: "broadcast",
        event: "chat",
        payload: {
          id: `sys-${Date.now()}`,
          user_id: "system",
          display_name: "Round over",
          avatar: "🎯",
          text: state.word
            ? `The word was "${state.word}"`
            : "Round over",
          is_system: true,
        },
      });
    }

    await updateState({
      phase: "round_end",
      players,
    });

    // After 4 seconds, advance to next round or finish
    setTimeout(() => advanceRound(players), 4000);
  };

  const advanceRound = async (players: Player[]) => {
    const nextIndex = state.drawer_index + 1;
    if (nextIndex >= state.drawer_order.length) {
      // Game over
      await updateState(
        {
          phase: "finished",
          players,
          drawer_id: null,
          word: null,
          word_pattern: "",
          round_ends_at: null,
        },
        "finished",
      );
    } else {
      await updateState({
        phase: "choosing",
        round: state.round + 1,
        drawer_index: nextIndex,
        drawer_id: state.drawer_order[nextIndex],
        word_choices: pickWordChoices(3),
        word: null,
        word_pattern: "",
        round_ends_at: null,
        guessers: [],
        players,
      });
    }
  };

  // ---------- Chat / guessing ----------
  const sendChat = async (text: string) => {
    if (!text.trim() || !channel || !me) return;
    if (isDrawer && phase === "drawing") {
      // Drawer can't chat during their own draw
      return;
    }

    // Already guessed correctly: anything they send is private to-the-room (could broadcast as an after-the-fact message; for MVP, hide)
    if (guessedThisRound.current) return;

    const correct =
      phase === "drawing" && state.word && isCorrectGuess(text, state.word);

    if (correct) {
      guessedThisRound.current = true;
      Sfx.match();
      const position =
        state.guessers.filter((g) => g.user_id !== me.user_id).length + 1;
      const points = pointsForGuess(position);
      const newGuessers = [...state.guessers, { user_id: me.user_id, position, points }];
      const newPlayers = state.players.map((p) =>
        p.user_id === me.user_id ? { ...p, score: p.score + points } : p,
      );

      await updateState({
        guessers: newGuessers,
        players: newPlayers,
      });

      // Broadcast a system "X guessed it!" message instead of the actual guess
      channel.send({
        type: "broadcast",
        event: "chat",
        payload: {
          id: `${Date.now()}`,
          user_id: me.user_id,
          display_name: me.display_name,
          avatar: me.avatar,
          text: `guessed it! +${points}`,
          is_correct: true,
        } satisfies ChatMessage,
      });

      // The drawer's tab will see the updated guessers via postgres_changes
      // and trigger endRound from the effect above when everyone has guessed.
      return;
    }

    // Normal chat
    const msg: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      user_id: me.user_id,
      display_name: me.display_name,
      avatar: me.avatar,
      text,
    };
    channel.send({ type: "broadcast", event: "chat", payload: msg });
    setChat((c) => [...c, msg].slice(-100));
  };

  // ---------- Leave / close ----------
  const leaveOrClose = async () => {
    setClosing(true);
    if (isHost) {
      await supabase.from("skribbl_rooms").delete().eq("id", roomId);
    } else if (!isSpectator) {
      // Remove self from participants + players
      const newParticipants = state.players
        .filter((p) => p.user_id !== myUserId)
        .map((p) => p.user_id);
      const newPlayers = state.players.filter((p) => p.user_id !== myUserId);
      await supabase
        .from("skribbl_rooms")
        .update({
          participants: [...newParticipants, /* keep host */],
          state: { ...state, players: newPlayers },
        })
        .eq("id", roomId);
    }
    // Spectators just navigate away — no DB write.
    router.push("/multiplayer/skribbl");
  };

  // ---------- UI ----------
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

  const isSpectator = !isParticipant;

  return (
    <div className="space-y-4">
      {isSpectator && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 flex items-center gap-3">
          <span className="text-xl" aria-hidden>👀</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold">Watching as spectator</div>
            <div className="text-xs text-[var(--muted)]">
              You can see the drawing and chat, but can&apos;t guess or score.
              Wait for the next room to play.
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <RoomHeader
        roomId={roomId}
        phase={phase}
        secondsLeft={secondsLeft}
        wordPattern={state.word_pattern}
        wordReveal={phase === "round_end" ? state.word : null}
        wordToShow={wordToShow}
        round={state.round}
        maxRounds={state.max_rounds}
      />

      <div className="grid lg:grid-cols-[1fr_300px] gap-4">
        {/* Left column: canvas + word choice / lobby UI */}
        <div className="space-y-4">
          {phase === "lobby" && (
            <LobbyPanel
              isHost={isHost}
              players={state.players}
              onStart={startGame}
              error={error}
            />
          )}

          {phase === "choosing" && (
            <ChoosingPanel
              isDrawer={isDrawer}
              drawer={
                state.players.find((p) => p.user_id === state.drawer_id) ?? null
              }
              wordChoices={state.word_choices}
              onChoose={chooseWord}
            />
          )}

          {(phase === "drawing" ||
            phase === "round_end" ||
            phase === "finished") && (
            <DrawingCanvas canDraw={isDrawer && phase === "drawing"} channel={channel} />
          )}

          {phase === "finished" && (
            <FinishedPanel
              isHost={isHost}
              players={state.players}
              onReset={async () => {
                if (!isHost) return;
                await updateState(
                  {
                    phase: "lobby",
                    round: 0,
                    drawer_order: [],
                    drawer_index: 0,
                    drawer_id: null,
                    word_choices: [],
                    word: null,
                    word_pattern: "",
                    round_ends_at: null,
                    guessers: [],
                    players: state.players.map((p) => ({ ...p, score: 0 })),
                  },
                  "lobby",
                );
              }}
            />
          )}
        </div>

        {/* Right column: players + chat */}
        <div className="space-y-4">
          <PlayerSidebar
            players={state.players}
            drawerId={state.drawer_id}
            myUserId={myUserId}
            guessers={state.guessers}
          />
          <ChatBox
            messages={chat}
            myUserId={myUserId}
            disabled={
              isSpectator ||
              phase === "lobby" ||
              phase === "choosing" ||
              (phase === "drawing" && isDrawer) ||
              guessedThisRound.current
            }
            placeholder={
              isSpectator
                ? "Spectators can't chat — sit back and watch"
                : isDrawer && phase === "drawing"
                  ? "You're drawing — others guess"
                  : guessedThisRound.current
                    ? "You guessed it!"
                    : phase === "drawing"
                      ? "Type your guess…"
                      : "Chat with the room…"
            }
            value={chatInput}
            onChange={setChatInput}
            onSend={() => {
              const t = chatInput.trim();
              if (t) {
                sendChat(t);
                setChatInput("");
              }
            }}
          />
        </div>
      </div>

      {/* Footer: sound toggle + leave / close */}
      <div className="flex justify-end items-center gap-2 pt-2">
        <SoundToggle />
        <button
          type="button"
          onClick={leaveOrClose}
          disabled={closing}
          className="text-xs px-3 py-1.5 rounded-lg bg-red-500/15 text-red-300 font-bold hover:bg-red-500 hover:text-white transition-colors disabled:opacity-50"
        >
          {closing ? "…" : isHost ? "Close room" : isSpectator ? "Stop watching" : "Leave"}
        </button>
      </div>
    </div>
  );
}

// ---------- Sub-components ----------

function RoomHeader({
  roomId,
  phase,
  secondsLeft,
  wordPattern,
  wordReveal,
  wordToShow,
  round,
  maxRounds,
}: {
  roomId: string;
  phase: Phase;
  secondsLeft: number;
  wordPattern: string;
  wordReveal: string | null;
  wordToShow: string | null;
  round: number;
  maxRounds: number;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 flex items-center gap-4 flex-wrap">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-[var(--muted)] font-bold">
          Room
        </div>
        <div className="font-mono text-2xl font-black tracking-[0.25em]">
          {roomId}
        </div>
      </div>
      {phase !== "lobby" && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--muted)] font-bold">
            Round
          </div>
          <div className="text-lg font-bold">
            {round} / {maxRounds}
          </div>
        </div>
      )}
      {phase === "drawing" && (
        <>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[var(--muted)] font-bold">
              Time
            </div>
            <div
              className={`text-2xl font-black ${
                secondsLeft <= 10 ? "text-red-400" : "text-white"
              }`}
            >
              {secondsLeft}s
            </div>
          </div>
          <div className="ml-auto">
            <div className="text-[10px] uppercase tracking-widest text-[var(--muted)] font-bold">
              {wordToShow ? "Your word" : "Word"}
            </div>
            <div className="font-mono text-2xl font-black tracking-[0.3em]">
              {wordToShow ?? wordPattern}
            </div>
          </div>
        </>
      )}
      {phase === "round_end" && wordReveal && (
        <div className="ml-auto">
          <div className="text-[10px] uppercase tracking-widest text-[var(--muted)] font-bold">
            Reveal
          </div>
          <div className="font-mono text-2xl font-black tracking-[0.2em] text-emerald-400">
            {wordReveal}
          </div>
        </div>
      )}
      {phase === "choosing" && (
        <div className="ml-auto text-sm text-[var(--muted)]">
          Drawer is picking a word…
        </div>
      )}
    </div>
  );
}

function LobbyPanel({
  isHost,
  players,
  onStart,
  error,
}: {
  isHost: boolean;
  players: Player[];
  onStart: () => void;
  error: string | null;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
      <div className="text-5xl mb-3">🎨</div>
      <h2 className="text-2xl font-black mb-1">Waiting room</h2>
      <p className="text-sm text-[var(--muted)] mb-6">
        {players.length} {players.length === 1 ? "player" : "players"} in the room.
        Need at least 2 to start.
      </p>
      {isHost ? (
        <button
          onClick={onStart}
          disabled={players.length < 2}
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] text-white font-bold hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100"
        >
          Start game
        </button>
      ) : (
        <div className="text-sm text-[var(--muted)]">Waiting for the host to start…</div>
      )}
      {error && (
        <div className="text-xs text-red-400 mt-3">{error}</div>
      )}
    </div>
  );
}

function ChoosingPanel({
  isDrawer,
  drawer,
  wordChoices,
  onChoose,
}: {
  isDrawer: boolean;
  drawer: Player | null;
  wordChoices: string[];
  onChoose: (word: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
      {isDrawer ? (
        <>
          <h2 className="text-xl font-black mb-1">You&apos;re drawing!</h2>
          <p className="text-sm text-[var(--muted)] mb-5">Pick a word</p>
          <div className="flex flex-wrap gap-3 justify-center">
            {wordChoices.map((w) => (
              <button
                key={w}
                onClick={() => onChoose(w)}
                className="px-5 py-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/10 font-bold transition-all"
              >
                {w}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="flex justify-center mb-3">
            <Avatar value={drawer?.avatar ?? "🎨"} size="lg" />
          </div>
          <h2 className="text-xl font-black mb-1">
            {drawer?.display_name ?? "Player"} is choosing…
          </h2>
          <p className="text-sm text-[var(--muted)]">Get ready to guess.</p>
        </>
      )}
    </div>
  );
}

function FinishedPanel({
  isHost,
  players,
  onReset,
}: {
  isHost: boolean;
  players: Player[];
  onReset: () => void;
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8">
      <div className="text-center mb-6">
        <div className="text-5xl mb-2">🏆</div>
        <h2 className="text-2xl font-black">Game over</h2>
      </div>
      <div className="space-y-2 max-w-sm mx-auto mb-6">
        {sorted.map((p, i) => (
          <div
            key={p.user_id}
            className={`flex items-center gap-3 p-3 rounded-xl ${
              i === 0
                ? "bg-yellow-500/15"
                : i === 1
                  ? "bg-zinc-300/10"
                  : i === 2
                    ? "bg-amber-700/15"
                    : "bg-[var(--surface-2)]"
            }`}
          >
            <div className="w-8 text-center font-black">
              {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
            </div>
            <Avatar value={p.avatar} size="sm" />
            <div className="flex-1 font-bold truncate">{p.display_name}</div>
            <div className="text-xl font-black">{p.score}</div>
          </div>
        ))}
      </div>
      {isHost ? (
        <div className="text-center">
          <button
            onClick={onReset}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] text-white font-bold hover:scale-105 transition-transform"
          >
            Back to lobby
          </button>
        </div>
      ) : (
        <div className="text-center text-sm text-[var(--muted)]">
          Waiting for the host…
        </div>
      )}
    </div>
  );
}

function PlayerSidebar({
  players,
  drawerId,
  myUserId,
  guessers,
}: {
  players: Player[];
  drawerId: string | null;
  myUserId: string;
  guessers: { user_id: string; position: number; points: number }[];
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="text-[10px] uppercase tracking-widest text-[var(--muted)] font-bold px-2 mb-2">
        Players ({players.length})
      </div>
      <div className="space-y-1">
        {sorted.map((p, i) => {
          const isDrawer = p.user_id === drawerId;
          const isMe = p.user_id === myUserId;
          const guess = guessers.find((g) => g.user_id === p.user_id);
          return (
            <div
              key={p.user_id}
              className={`flex items-center gap-2 px-2 py-2 rounded-lg ${
                isMe ? "bg-[var(--accent)]/10" : ""
              }`}
            >
              <div className="text-xs font-bold w-5 text-center text-[var(--muted)]">
                {i + 1}
              </div>
              <Avatar value={p.avatar} size="xs" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate">
                  {p.display_name} {isMe && <span className="text-[var(--accent)] text-xs">(you)</span>}
                </div>
                <div className="text-[10px] text-[var(--muted)] flex items-center gap-1">
                  {isDrawer && <span className="text-[var(--accent-2)]">✏️ drawing</span>}
                  {guess && (
                    <span className="text-emerald-400">
                      ✓ +{guess.points}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-sm font-black">{p.score}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChatBox({
  messages,
  myUserId,
  disabled,
  placeholder,
  value,
  onChange,
  onSend,
}: {
  messages: ChatMessage[];
  myUserId: string;
  disabled: boolean;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 9e9, behavior: "smooth" });
  }, [messages.length]);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] flex flex-col h-72">
      <div className="text-[10px] uppercase tracking-widest text-[var(--muted)] font-bold px-3 py-2 border-b border-[var(--border)]">
        Chat / guesses
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-2 space-y-1 text-sm">
        {messages.length === 0 && (
          <div className="text-xs text-[var(--muted)] px-2">No messages yet.</div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`px-2 py-1 rounded-md ${
              m.is_correct
                ? "bg-emerald-500/15 text-emerald-300"
                : m.is_system
                  ? "bg-yellow-500/10 text-yellow-300"
                  : m.user_id === myUserId
                    ? "bg-[var(--accent)]/10"
                    : ""
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <Avatar value={m.avatar} size="xs" />
              <b className="text-xs">{m.display_name}:</b>
              <span className="text-xs">{m.text}</span>
            </span>
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!disabled) onSend();
        }}
        className="border-t border-[var(--border)] p-2"
      >
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={80}
          className="w-full h-9 px-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--accent)] disabled:opacity-50"
        />
      </form>
    </div>
  );
}
