import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { generateRoomCode, INITIAL_STATE } from "@/lib/skribbl/state";
import { JoinForm } from "@/components/JoinForm";
import { RecentRoomsList, type RecentRoom } from "@/components/RecentRoomsList";
import { BackButton } from "@/components/BackButton";

export const metadata = { title: "Skribbl — Multiplayer drawing game — Nexplay" };

const JOIN_PATH = "/multiplayer/skribbl";

async function createRoomAction() {
  "use server";
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase not configured");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${JOIN_PATH}`);

  // Look up the host's profile so they appear immediately in the players list
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_emoji")
    .eq("id", user.id)
    .single();

  const hostPlayer = {
    user_id: user.id,
    display_name:
      profile?.display_name ?? user.email?.split("@")[0] ?? "Player",
    avatar: profile?.avatar_emoji ?? "🎮",
    score: 0,
  };

  let lastErr: string | null = null;
  for (let i = 0; i < 5; i++) {
    const code = generateRoomCode(6);
    const { error } = await supabase.from("skribbl_rooms").insert({
      id: code,
      host_user_id: user.id,
      state: { ...INITIAL_STATE, players: [hostPlayer] },
      participants: [user.id],
      status: "lobby",
    });
    if (!error) redirect(`${JOIN_PATH}/${code}`);
    lastErr = error.message;
    if (!/duplicate|unique/i.test(error.message)) break;
  }
  throw new Error(lastErr ?? "Could not create room");
}

export default async function SkribblLobby() {
  if (!isSupabaseConfigured) return <SetupNotice />;

  const supabase = await createClient();
  let myRecentRooms: RecentRoom[] = [];
  let myUserId = "";
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      myUserId = user.id;
      const { data } = await supabase
        .from("skribbl_rooms")
        .select("id, status, created_at, host_user_id")
        .contains("participants", [user.id])
        .order("created_at", { ascending: false })
        .limit(5);
      myRecentRooms = (data ?? []).map((r) => ({
        id: r.id as string,
        status:
          r.status === "lobby"
            ? "waiting"
            : (r.status as "playing" | "finished"),
        created_at: r.created_at as string,
        host_user_id: r.host_user_id as string,
      }));
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8 md:py-12">
      <div className="mb-4">
        <BackButton fallback="/multiplayer" label="Multiplayer" />
      </div>
      <div className="text-center mb-10">
        <div className="text-6xl mb-3">🎨</div>
        <h1 className="text-3xl md:text-4xl font-black mb-1">
          Skribbl — draw &amp; guess
        </h1>
        <p className="text-[var(--muted)]">
          Take turns drawing while everyone races to guess. Real-time, with
          friends, in your browser.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-8">
        <form action={createRoomAction}>
          <button
            type="submit"
            className="w-full h-32 rounded-2xl bg-gradient-to-br from-purple-500 via-pink-500 to-yellow-400 text-white p-6 text-left hover:scale-[1.02] transition-transform"
          >
            <div className="text-3xl mb-2">🖌️</div>
            <div className="text-xl font-black">Create room</div>
            <div className="text-sm text-white/85">Get a code &amp; share</div>
          </button>
        </form>

        <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6">
          <div className="text-3xl mb-2">🔗</div>
          <div className="text-xl font-black mb-1">Join with code</div>
          <JoinForm basePath="/multiplayer/skribbl" />
        </div>
      </div>

      {myRecentRooms.length > 0 && (
        <RecentRoomsList rooms={myRecentRooms} myUserId={myUserId} />
      )}

      <div className="mt-10 text-xs text-[var(--muted)] text-center">
        Best with 3-6 players · 60 seconds per round · 1 round per player
      </div>
    </div>
  );
}

function SetupNotice() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-6">
        <h1 className="text-xl font-bold mb-2">Supabase setup required</h1>
        <p className="text-sm text-[var(--muted)]">
          Multiplayer needs Supabase configured. See{" "}
          <Link href="/login" className="text-[var(--accent)]">
            /login
          </Link>{" "}
          for setup instructions.
        </p>
      </div>
    </div>
  );
}
