import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { otherParty } from "@/lib/social";
import { BackButton } from "@/components/BackButton";
import { FriendsClient, type FriendRow, type RequestRow } from "./FriendsClient";

export const metadata = { title: "Friends — Nexplay" };

export default async function FriendsPage() {
  if (!isSupabaseConfigured) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <div className="rounded-2xl border border-yellow-300 bg-yellow-50 p-6">
          <h1 className="text-xl font-bold mb-2">Supabase setup required</h1>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/friends");

  // All friendship rows touching me
  const { data: rows } = await supabase
    .from("friendships")
    .select("user_a, user_b, status, initiated_by, created_at")
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
    .order("created_at", { ascending: false });

  const all = rows ?? [];
  const ids = Array.from(new Set(all.map((r) => otherParty(r, user.id))));
  const { data: profiles } = ids.length
    ? await supabase
        .from("profiles")
        .select("id, display_name, avatar_emoji")
        .in("id", ids)
    : { data: [] as { id: string; display_name: string | null; avatar_emoji: string | null }[] };

  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id, p] as const),
  );

  const friends: FriendRow[] = [];
  const incoming: RequestRow[] = [];
  const outgoing: RequestRow[] = [];
  const blocked: FriendRow[] = [];

  for (const r of all) {
    const otherId = otherParty(r, user.id);
    const p = profileById.get(otherId);
    const display_name = p?.display_name ?? "Unknown";
    const avatar = p?.avatar_emoji ?? "liam";
    const target = { user_id: otherId, display_name, avatar };

    if (r.status === "accepted") {
      friends.push(target);
    } else if (r.status === "pending") {
      const isIncoming = r.initiated_by !== user.id;
      if (isIncoming) incoming.push(target);
      else outgoing.push(target);
    } else if (r.status === "blocked" && r.initiated_by === user.id) {
      // Only show blocks initiated by me — the OTHER person blocking me
      // shouldn't surface in my UI.
      blocked.push(target);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8 md:py-12">
      <div className="mb-4">
        <BackButton fallback="/" />
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="text-3xl">👥</div>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight">Friends</h1>
        <span className="ml-auto text-sm text-[var(--muted)] font-medium">
          {friends.length} friend{friends.length === 1 ? "" : "s"}
        </span>
      </div>

      <FriendsClient
        myUserId={user.id}
        friends={friends}
        incoming={incoming}
        outgoing={outgoing}
        blocked={blocked}
      />

      <p className="mt-8 text-xs text-[var(--muted)] text-center">
        To find someone, type their exact display name. Edit yours on{" "}
        <Link href="/profile" className="text-[var(--accent)] hover:underline">
          your profile
        </Link>
        .
      </p>
    </div>
  );
}
