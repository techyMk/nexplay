import Link from "next/link";
import { BackButton } from "@/components/BackButton";

export const metadata = { title: "Multiplayer — Nexplay" };

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

export default function MultiplayerHub() {
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
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {MULTIPLAYER_GAMES.map((g) => {
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
