import Link from "next/link";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { GAMES } from "@/lib/catalog";
import { ProfileEditor } from "@/components/ProfileEditor";
import { GameArt } from "@/components/GameArt";
import { BackButton } from "@/components/BackButton";

export const metadata = { title: "Profile — Nexplay" };

export default async function ProfilePage() {
  if (!isSupabaseConfigured) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-6">
          <h1 className="text-xl font-bold mb-2">Supabase not configured</h1>
          <p className="text-sm text-[var(--muted)]">
            See <Link href="/login" className="text-[var(--accent)]">/login</Link>{" "}
            for setup instructions.
          </p>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/profile");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_emoji, username, created_at")
    .eq("id", user.id)
    .single();

  const { data: scores } = await supabase
    .from("scores")
    .select("game_slug, score, created_at")
    .eq("user_id", user.id)
    .order("score", { ascending: false });

  // Best score per game
  const bestByGame = new Map<string, { score: number; created_at: string }>();
  for (const s of scores ?? []) {
    if (!bestByGame.has(s.game_slug) || s.score > bestByGame.get(s.game_slug)!.score) {
      bestByGame.set(s.game_slug, { score: s.score, created_at: s.created_at });
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8 md:py-12">
      <div className="mb-4">
        <BackButton fallback="/" />
      </div>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8 mb-8">
        <ProfileEditor
          initial={{
            display_name: profile?.display_name ?? "",
            avatar_emoji: profile?.avatar_emoji ?? "🎮",
            email: user.email ?? "",
          }}
        />
      </div>

      <h2 className="text-xl font-black mb-4">Your best scores</h2>
      {bestByGame.size === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-[var(--muted)]">
          No scores yet. Go play some games!
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
          {[...bestByGame.entries()].map(([slug, info]) => {
            const game = GAMES.find((g) => g.slug === slug);
            return (
              <div key={slug} className="flex items-center gap-4 p-4">
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center"
                  style={{ background: game?.gradient ?? "var(--surface-2)" }}
                >
                  <GameArt
                    icon={game?.icon}
                    glyph={game?.glyph ?? "🎮"}
                    size="sm"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/game/${slug}`}
                    className="font-bold hover:text-[var(--accent)] truncate block"
                  >
                    {game?.title ?? slug}
                  </Link>
                  <div className="text-xs text-[var(--muted)]">
                    {new Date(info.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black">{info.score.toLocaleString()}</div>
                  <Link
                    href={`/leaderboard/${slug}`}
                    className="text-xs text-[var(--muted)] hover:text-[var(--accent)]"
                  >
                    Leaderboard →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
