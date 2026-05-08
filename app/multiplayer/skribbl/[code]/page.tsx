import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Player, SkribblState } from "@/lib/skribbl/state";
import { SkribblRoomClient } from "./Room";
import { BackButton } from "@/components/BackButton";

export const metadata = { title: "Skribbl Room — Nexplay" };

export default async function SkribblRoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const upper = code.toUpperCase();

  if (!isSupabaseConfigured) redirect("/login");
  const supabase = await createClient();
  if (!supabase) redirect("/login");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=/multiplayer/skribbl/${upper}`);
  }

  const { data: row } = await supabase
    .from("skribbl_rooms")
    .select(
      "id, host_user_id, state, participants, status, created_at",
    )
    .eq("id", upper)
    .single();

  if (!row) notFound();

  const participants = (row.participants ?? []) as string[];
  const state = row.state as SkribblState;

  // Auto-join: add the current user to participants & players list if in lobby
  // and they're not already in. RLS allows non-participants to update lobby
  // rooms as long as they end up as participants (with-check).
  const alreadyIn = participants.includes(user.id);
  if (!alreadyIn && row.status === "lobby") {
    // Look up profile for display info
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, avatar_emoji")
      .eq("id", user.id)
      .single();

    const newPlayer: Player = {
      user_id: user.id,
      display_name: profile?.display_name ?? user.email?.split("@")[0] ?? "Player",
      avatar: profile?.avatar_emoji ?? "🎮",
      score: 0,
    };

    const newParticipants = [...participants, user.id];
    const newPlayers = [...(state.players ?? []), newPlayer];
    const nextState: SkribblState = { ...state, players: newPlayers };

    const { error } = await supabase
      .from("skribbl_rooms")
      .update({
        participants: newParticipants,
        state: nextState,
      })
      .eq("id", upper);

    if (!error) {
      participants.push(user.id);
      Object.assign(row, { participants: newParticipants, state: nextState });
    }
  }

  const isHost = row.host_user_id === user.id;
  const isParticipant = participants.includes(user.id);

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 md:py-10">
      <div className="mb-4">
        <BackButton fallback="/multiplayer/skribbl" label="Lobby" />
      </div>

      <SkribblRoomClient
        roomId={row.id}
        myUserId={user.id}
        isHost={isHost}
        isParticipant={isParticipant}
        initialState={row.state as SkribblState}
        initialStatus={row.status as "lobby" | "playing" | "finished"}
      />
    </div>
  );
}
