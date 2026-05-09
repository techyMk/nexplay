import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { BackButton } from "@/components/BackButton";
import { CheckersRoomClient } from "./Room";

export const metadata = { title: "Checkers Room — Nexplay" };

export default async function CheckersRoomPage({
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
    redirect(`/login?next=/multiplayer/checkers/${upper}`);
  }

  const { data: room } = await supabase
    .from("rooms")
    .select(
      "id, game_slug, host_user_id, guest_user_id, state, status, created_at",
    )
    .eq("id", upper)
    .single();

  if (!room || room.game_slug !== "checkers") notFound();

  if (
    !room.guest_user_id &&
    room.host_user_id !== user.id &&
    room.status === "waiting"
  ) {
    const { error } = await supabase
      .from("rooms")
      .update({ guest_user_id: user.id, status: "playing" })
      .eq("id", upper)
      .is("guest_user_id", null);
    if (!error) {
      room.guest_user_id = user.id;
      room.status = "playing";
    }
  }

  const ids = [room.host_user_id, room.guest_user_id].filter(
    (x): x is string => Boolean(x),
  );
  const { data: profiles } = ids.length
    ? await supabase
        .from("profiles")
        .select("id, display_name, avatar_emoji")
        .in("id", ids)
    : { data: [] as { id: string; display_name: string | null; avatar_emoji: string | null }[] };

  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id, p] as const),
  );
  const host = profileById.get(room.host_user_id);
  const guest = room.guest_user_id ? profileById.get(room.guest_user_id) : null;

  const myRole: "host" | "guest" | "spectator" =
    user.id === room.host_user_id
      ? "host"
      : user.id === room.guest_user_id
        ? "guest"
        : "spectator";

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 md:py-10">
      <div className="mb-4">
        <BackButton fallback="/multiplayer/checkers" label="Lobby" />
      </div>

      <CheckersRoomClient
        roomId={room.id}
        myRole={myRole}
        myUserId={user.id}
        initial={{
          hostUserId: room.host_user_id,
          guestUserId: room.guest_user_id,
          state: room.state,
          status: room.status,
          host: host
            ? {
                name: host.display_name ?? "Player",
                avatar: host.avatar_emoji ?? "liam",
              }
            : null,
          guest: guest
            ? {
                name: guest.display_name ?? "Player",
                avatar: guest.avatar_emoji ?? "liam",
              }
            : null,
        }}
      />
    </div>
  );
}
