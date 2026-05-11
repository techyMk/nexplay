import Link from "next/link";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { GAMES, popularGames } from "@/lib/catalog";
import { syncAchievements } from "@/lib/achievements-server";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { isAdminEmail, isAdminUnlocked } from "@/lib/admin";
import { AdminUnlockCard } from "@/components/AdminUnlockCard";
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

  // Achievements summary
  const { unlockedSet } = await syncAchievements(supabase, user.id);
  const unlockedList = ACHIEVEMENTS.filter((a) => unlockedSet.has(a.id));
  const recentlyUnlocked = unlockedList.slice(0, 6);

  // Admin unlock state — card only renders for the admin email; the
  // "alreadyUnlocked" flag drives whether to show the unlock form or
  // the open/lock buttons.
  const isAdmin = isAdminEmail(user.email);
  const adminUnlocked = isAdmin ? await isAdminUnlocked(user.email) : false;

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8 md:py-12">
      <div className="mb-4">
        <BackButton fallback="/" />
      </div>
      {isAdmin && <AdminUnlockCard alreadyUnlocked={adminUnlocked} />}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8 mb-8">
        <ProfileEditor
          initial={{
            display_name: profile?.display_name ?? "",
            avatar_emoji: profile?.avatar_emoji ?? "🎮",
            email: user.email ?? "",
          }}
        />
      </div>

      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-xl font-black">Achievements</h2>
        <Link
          href="/achievements"
          className="text-sm text-[var(--accent)] hover:underline"
        >
          View all →
        </Link>
      </div>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 mb-8">
        <div className="text-sm text-[var(--muted)] mb-3">
          {unlockedList.length} of {ACHIEVEMENTS.length} unlocked
        </div>
        {unlockedList.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            None yet — they unlock automatically as you play. Try the{" "}
            <Link href="/daily" className="text-[var(--accent)] hover:underline">
              daily challenges
            </Link>{" "}
            to get started.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {recentlyUnlocked.map((a) => (
              <span
                key={a.id}
                title={a.description}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-sm font-bold"
              >
                <span className="text-base">{a.emoji}</span>
                {a.title}
              </span>
            ))}
            {unlockedList.length > recentlyUnlocked.length && (
              <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-[var(--surface-2)] text-sm text-[var(--muted)]">
                +{unlockedList.length - recentlyUnlocked.length} more
              </span>
            )}
          </div>
        )}
      </div>

      <h2 className="text-xl font-black mb-4">Your best scores</h2>
      {bestByGame.size === 0 ? (
        // Brand-new user with no plays — suggest 4 popular games so
        // they have a concrete starting point instead of a plain
        // dead-end message.
        <div className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-center">
          <div className="text-4xl mb-2">🎮</div>
          <div className="font-black text-base mb-1">No scores yet</div>
          <p className="text-sm text-[var(--muted)] max-w-sm mx-auto mb-4">
            Play any game and your high score lands here automatically.
            A few popular picks to get going:
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto">
            {popularGames(4).map((g) => (
              <Link
                key={g.slug}
                href={`/game/${g.slug}`}
                className="group rounded-xl overflow-hidden border border-[var(--border)] hover:border-[var(--accent)] card-lift"
              >
                <div
                  className="aspect-square flex items-center justify-center text-4xl"
                  style={{ background: g.gradient }}
                >
                  {g.glyph}
                </div>
                <div className="px-2 py-1.5 bg-[var(--surface)] text-left">
                  <div className="font-black text-xs truncate">{g.title}</div>
                </div>
              </Link>
            ))}
          </div>
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
