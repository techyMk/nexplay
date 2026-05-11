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
        className="shrink-0 inline-flex items-center justify-center gap-1.5 h-9 px-2 sm:px-3 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors text-sm font-medium"
        aria-label="Log in"
      >
        {/* User-circle icon on mobile, label on larger screens. */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4 sm:hidden"
          aria-hidden
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <span className="hidden sm:inline">Log in</span>
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
