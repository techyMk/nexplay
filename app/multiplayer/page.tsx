import Link from "next/link";
import { BackButton } from "@/components/BackButton";
import { getUser } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata = { title: "Multiplayer — Nexplay" };
// Live room counts are stale within a minute, but completely caching
// this page would freeze the activity numbers indefinitely. 30s is a
// reasonable middle ground.
export const revalidate = 30;

/** Query Supabase for the number of active rooms (status in waiting /
 *  playing) per game slug. Skribbl uses a separate table; merge it in.
 *  Returns a Map keyed by game slug — slugs without any rooms are
 *  absent (the card just won't show a badge). */
async function fetchActiveRoomCounts(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!isSupabaseConfigured) return counts;
  const supabase = await createClient();
  if (!supabase) return counts;

  const [rooms, skribbl] = await Promise.all([
    supabase
      .from("rooms")
      .select("game_slug")
      .in("status", ["waiting", "playing"]),
    supabase
      .from("skribbl_rooms")
      .select("id", { count: "exact", head: true })
      .in("status", ["lobby", "playing"]),
  ]);

  for (const row of rooms.data ?? []) {
    const slug = (row as { game_slug: string }).game_slug;
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  if (typeof skribbl.count === "number") {
    counts.set("skribbl", skribbl.count);
  }
  return counts;
}

const MULTIPLAYER_GAMES = [
  {
    slug: "skribbl",
    title: "Skribbl",
    glyph: "🎨",
    gradient: "linear-gradient(135deg, #a855f7 0%, #facc15 100%)",
    desc: "Real-time draw and guess with friends. 2-8 players, 60s rounds.",
    available: true,
    badge: "New",
  },
  {
    slug: "tic-tac-toe",
    title: "Tic-Tac-Toe",
    glyph: "❌⭕",
    gradient: "linear-gradient(135deg, #7c5cff 0%, #ff5cae 100%)",
    desc: "Real-time 1-vs-1 over Supabase Realtime. Share a code, play instantly.",
    available: true,
  },
  {
    slug: "connect-four",
    title: "Connect Four",
    glyph: "🔴",
    gradient: "linear-gradient(135deg, #ef4444 0%, #f59e0b 100%)",
    desc: "Real-time 1-vs-1 — drop discs and align four in a row.",
    available: true,
  },
  {
    slug: "pong",
    title: "Pong",
    glyph: "🏓",
    gradient: "linear-gradient(135deg, #06b6d4 0%, #ec4899 100%)",
    desc: "Real-time arcade classic. First to 5 points takes the round.",
    available: true,
    badge: "New",
  },
  {
    slug: "checkers",
    title: "Checkers",
    glyph: "♟️",
    gradient: "linear-gradient(135deg, #b91c1c 0%, #1f2937 100%)",
    desc: "Real-time 1-vs-1. Mandatory captures, multi-jumps, kings.",
    available: true,
    badge: "New",
  },
  {
    slug: "chess",
    title: "Chess",
    glyph: "♔",
    gradient: "linear-gradient(135deg, #78350f 0%, #1c1917 100%)",
    desc: "Real-time 1-vs-1 with full rules. Host plays white, guest plays black.",
    available: true,
    badge: "New",
  },
];

export default async function MultiplayerHub() {
  const [user, activeRooms] = await Promise.all([
    getUser(),
    fetchActiveRoomCounts(),
  ]);
  const totalActive = [...activeRooms.values()].reduce((a, b) => a + b, 0);
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8 md:py-12">
      <div className="mb-4">
        <BackButton fallback="/" />
      </div>
      <div className="text-center mb-10">
        <div className="text-5xl mb-3">👥</div>
        <h1 className="text-3xl md:text-4xl font-black mb-2">Multiplayer</h1>
        <p className="text-[var(--muted)] max-w-md mx-auto">
          Real-time games with friends. Pick a game, create a room, share the
          code.
        </p>
        {totalActive > 0 && (
          // text-emerald-700 keeps WCAG contrast on the light theme;
          // dark theme overrides via the bg/border opacity.
          <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/50 text-emerald-700 dark:text-emerald-200 text-xs font-black uppercase tracking-wider">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            {totalActive} {totalActive === 1 ? "room" : "rooms"} live now
          </div>
        )}
      </div>

      {/* Guest CTA — multiplayer rooms write to Supabase rooms with
          the player's user id, so signed-out visitors can browse the
          tile grid but the create / join actions redirect them to
          login. Surfacing that up-front avoids the "I clicked Create
          Room and got bounced" confusion. */}
      {!user && (
        <div className="mb-8 rounded-2xl border border-[var(--accent)]/30 bg-gradient-to-br from-[var(--accent)]/10 to-[var(--accent-2)]/10 px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="text-3xl">🔐</div>
          <div className="flex-1 min-w-0">
            <div className="font-black text-sm mb-0.5">
              Sign in to play multiplayer
            </div>
            <div className="text-xs text-[var(--muted)]">
              Rooms are tied to your account — sign in (or create a free one)
              to host a game or join a friend&apos;s code.
            </div>
          </div>
          <Link
            href="/login?next=/multiplayer"
            className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-white text-xs font-black hover:scale-[1.03] transition-transform shadow-md"
          >
            Sign in →
          </Link>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {MULTIPLAYER_GAMES.map((g) => {
          const liveCount = activeRooms.get(g.slug) ?? 0;
          const Inner = (
            <div
              className={`rounded-2xl overflow-hidden border border-[var(--border)] transition-all h-full ${
                g.available
                  ? "hover:border-[var(--accent)] hover:-translate-y-1 hover:shadow-xl hover:shadow-[var(--accent-glow)]"
                  : "opacity-60"
              }`}
            >
              <div
                className="aspect-[16/10] flex items-center justify-center text-7xl relative"
                style={{ background: g.gradient }}
              >
                {g.glyph}
                {!g.available && (
                  <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/60 text-white text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm">
                    Soon
                  </div>
                )}
                {g.badge && (
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-white text-black text-[10px] font-black uppercase tracking-wider">
                    {g.badge}
                  </div>
                )}
                {/* Live-rooms pill in the top-right when there's any
                    activity. Pulsing green dot mirrors the header
                    "Multiplayer" indicator so the visual language is
                    consistent. */}
                {g.available && liveCount > 0 && (
                  <div className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-sm text-white text-[10px] font-black uppercase tracking-wider">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                    </span>
                    {liveCount} live
                  </div>
                )}
              </div>
              <div className="p-4 bg-[var(--surface)]">
                <div className="font-black text-lg">{g.title}</div>
                <div className="text-xs text-[var(--muted)] mt-1">{g.desc}</div>
              </div>
            </div>
          );
          return g.available ? (
            <Link key={g.slug} href={`/multiplayer/${g.slug}`}>
              {Inner}
            </Link>
          ) : (
            <div key={g.slug}>{Inner}</div>
          );
        })}
      </div>
    </div>
  );
}
