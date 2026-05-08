import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { AuthMenuClient } from "./AuthMenuClient";

export async function AuthMenu() {
  if (!isSupabaseConfigured) {
    return (
      <Link
        href="/login"
        className="text-xs text-[var(--muted)] hover:text-white px-3 py-2 rounded-lg hover:bg-[var(--surface)] transition-colors"
        title="Supabase setup required for accounts"
      >
        Setup
      </Link>
    );
  }

  const user = await getUser();
  if (!user) {
    return (
      <Link
        href="/login"
        className="text-sm font-medium px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
      >
        Log in
      </Link>
    );
  }

  // Fetch display info from profile
  const supabase = await createClient();
  let displayName = user.email?.split("@")[0] ?? "Player";
  let avatar = "🎮";
  if (supabase) {
    const { data } = await supabase
      .from("profiles")
      .select("display_name, avatar_emoji")
      .eq("id", user.id)
      .single();
    if (data?.display_name) displayName = data.display_name;
    if (data?.avatar_emoji) avatar = data.avatar_emoji;
  }

  return <AuthMenuClient displayName={displayName} avatar={avatar} />;
}
