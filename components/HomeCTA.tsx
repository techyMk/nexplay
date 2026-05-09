import Link from "next/link";
import { getUser } from "@/lib/supabase/server";

/**
 * Sign-up promo strip on the homepage. Hidden for already-signed-in
 * visitors — there's no point pitching account creation to someone
 * who has one. Uses our brand gradient with abstract decorative blobs.
 */
export async function HomeCTA() {
  const user = await getUser();
  if (user) return null;

  return (
    <section className="relative my-10 overflow-hidden rounded-3xl">
      <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)] via-[var(--accent-2)] to-[var(--accent-3)]" />

      {/* Decorative blobs */}
      <svg
        viewBox="0 0 400 200"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full opacity-30"
        aria-hidden
      >
        <defs>
          <radialGradient id="cta-blob-1">
            <stop offset="0%" stopColor="white" stopOpacity="0.7" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="40" cy="160" r="80" fill="url(#cta-blob-1)" />
        <circle cx="370" cy="40" r="60" fill="url(#cta-blob-1)" />
      </svg>

      {/* Stars / sparkles */}
      <div className="absolute top-6 right-12 text-3xl select-none rotate-12">✨</div>
      <div className="absolute bottom-8 left-16 text-2xl select-none -rotate-12">⭐</div>
      <div className="absolute top-10 left-1/2 text-xl select-none">🎮</div>

      <div className="relative px-6 py-10 md:px-12 md:py-12 flex flex-col md:flex-row items-start md:items-center gap-6 text-white">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-widest font-bold text-white/85 mb-1">
            Free forever
          </div>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-2 leading-tight">
            Sign up to climb the leaderboards
          </h2>
          <p className="text-white/85 text-sm md:text-base max-w-xl">
            Save your scores, pick a custom avatar, and rank up against players
            worldwide. No spam, no card, just play.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-[var(--foreground)] font-bold text-sm hover:scale-105 transition-transform shadow-md whitespace-nowrap"
          >
            Create account →
          </Link>
          <Link
            href="/multiplayer"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white/15 backdrop-blur-sm border border-white/30 text-white font-bold text-sm hover:bg-white/25 transition-colors"
          >
            👥 Try multiplayer
          </Link>
        </div>
      </div>
    </section>
  );
}
