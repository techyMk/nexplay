import { createClient, getUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { otherParty } from "@/lib/social";
import { NotificationBellClient, type NotificationData } from "./NotificationBellClient";

/**
 * Server component shell — fetches initial counts + lists of pending
 * requests and active invites server-side, then hands off to the
 * client component which subscribes to realtime updates.
 */
export async function NotificationBell() {
  if (!isSupabaseConfigured) return null;
  const user = await getUser();
  if (!user) return null;

  const supabase = await createClient();
  if (!supabase) return null;

  const [{ data: friendRows }, { data: invites }] = await Promise.all([
    supabase
      .from("friendships")
      .select("user_a, user_b, initiated_by, status, created_at")
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("game_invites")
      .select("id, from_user, game_slug, room_id, status, expires_at, created_at")
      .eq("to_user", user.id)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);

  const incomingRequests = (friendRows ?? [])
    .filter((r) => r.initiated_by !== user.id)
    .map((r) => ({ otherId: otherParty(r, user.id) }));

  // Resolve display info for everyone we need
  const ids = new Set<string>();
  incomingRequests.forEach((r) => ids.add(r.otherId));
  (invites ?? []).forEach((i) => ids.add(i.from_user));

  const { data: profiles } = ids.size
    ? await supabase
        .from("profiles")
        .select("id, display_name, avatar_emoji")
        .in("id", Array.from(ids))
    : { data: [] as { id: string; display_name: string | null; avatar_emoji: string | null }[] };

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const data: NotificationData = {
    requests: incomingRequests.map((r) => {
      const p = profileById.get(r.otherId);
      return {
        otherId: r.otherId,
        display_name: p?.display_name ?? "Player",
        avatar: p?.avatar_emoji ?? "liam",
      };
    }),
    invites: (invites ?? []).map((i) => {
      const p = profileById.get(i.from_user);
      return {
        id: i.id as string,
        from_user: i.from_user as string,
        display_name: p?.display_name ?? "Player",
        avatar: p?.avatar_emoji ?? "liam",
        game_slug: i.game_slug as string,
      };
    }),
  };

  return <NotificationBellClient initial={data} myUserId={user.id} />;
}
