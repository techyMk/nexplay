import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { generateRoomCode } from "@/lib/multiplayer";
import { INITIAL_PONG_STATE } from "@/lib/pong";
import { JoinForm } from "@/components/JoinForm";
import { RecentRoomsList, type RecentRoom } from "@/components/RecentRoomsList";
import { BackButton } from "@/components/BackButton";

export const metadata = { title: "Multiplayer Pong — Nexplay" };

async function createRoomAction() {
  "use server";
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase not configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/multiplayer/pong");

  let lastErr: string | null = null;
  for (let i = 0; i < 5; i++) {
    const code = generateRoomCode(6);
    const { error } = await supabase.from("rooms").insert({
      id: code,
      game_slug: "pong",
      host_user_id: user.id,
      state: INITIAL_PONG_STATE,
      status: "waiting",
    });
    if (!error) redirect(`/multiplayer/pong/${code}`);
    lastErr = error.message;
    if (!/duplicate|unique/i.test(error.message)) break;
  }
  throw new Error(lastErr ?? "Could not create room");
}

export default async function PongLobbyPage() {
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
        .from("rooms")
        .select("id, status, created_at, host_user_id")
        .eq("game_slug", "pong")
        .or(`host_user_id.eq.${user.id},guest_user_id.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .limit(5);
      myRecentRooms = (data ?? []) as RecentRoom[];
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8 md:py-12">
      <div className="mb-4">
        <BackButton fallback="/multiplayer" label="Multiplayer" />
      </div>

      <div className="text-center mb-10">
        <div className="text-6xl mb-3">🏓</div>
        <h1 className="text-3xl md:text-4xl font-black mb-1">
          Pong — Multiplayer
        </h1>
        <p className="text-[var(--muted)]">
          Real-time 1-vs-1. First to 5 points wins.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-8">
        <form action={createRoomAction}>
          <button
            type="submit"
            className="w-full h-32 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white p-6 text-left hover:scale-[1.02] transition-transform"
          >
            <div className="text-3xl mb-2">🏓</div>
            <div className="text-xl font-black">Create room</div>
            <div className="text-sm text-white/80">Get a code and share it</div>
          </button>
        </form>

        <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6">
          <div className="text-3xl mb-2">🔗</div>
          <div className="text-xl font-black mb-1">Join with code</div>
          <JoinForm basePath="/multiplayer/pong" />
        </div>
      </div>

      {myRecentRooms.length > 0 && (
        <RecentRoomsList rooms={myRecentRooms} myUserId={myUserId} />
      )}
    </div>
  );
}

function SetupNotice() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-6">
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
