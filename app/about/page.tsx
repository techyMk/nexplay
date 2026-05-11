import Link from "next/link";
import { BackButton } from "@/components/BackButton";
import { GAMES } from "@/lib/catalog";

export const metadata = {
  title: "About — Nexplay",
  description:
    "How Nexplay was built — tech stack, architecture decisions, what's interesting under the hood.",
};

/**
 * Case-study / about page. The README is for developers reading the
 * repo; this page is for visitors who landed on the live site and
 * want to know "what is this and how was it made". The content is
 * deliberately curated — the most interesting engineering bits, not
 * a feature list.
 */
export default function AboutPage() {
  const gameCount = GAMES.length;
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8 md:py-12">
      <div className="mb-4">
        <BackButton fallback="/" />
      </div>

      <div className="text-[10px] uppercase tracking-widest text-[var(--muted)] font-black mb-2">
        About this project
      </div>
      <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-4">
        Nexplay
      </h1>
      <p className="text-base text-[var(--muted)] leading-relaxed mb-8">
        A browser-game hub where <b>every game is custom-built</b>. No
        third-party iframes, no embeds. {gameCount} games across action,
        puzzle, strategy, arcade, racing, and adventure — plus six real-time
        multiplayer titles — all wrapped in a full account / leaderboards /
        achievements / daily-challenges layer.
      </p>

      <Section title="Why" emoji="🎯">
        <p>
          Most browser-game portals are ad-driven aggregators that embed
          third-party games. Nexplay is the opposite: a single-codebase,
          single-stack take on the genre, where the engineering, the
          rendering, the audio, and the game design are all in one repo.
        </p>
        <p>
          The goal isn&apos;t to compete with Poki or Crazy Games on catalog
          size. It&apos;s to demonstrate what one person can build end-to-end
          when they own every layer — from the canvas physics loop to the
          row-level-security policies in Postgres.
        </p>
      </Section>

      <Section title="Stack" emoji="🧱">
        <ul className="list-disc list-inside space-y-1">
          <li>
            <b>Next.js 16</b> (App Router, Turbopack), <b>React 19</b>,{" "}
            <b>TypeScript</b> strict
          </li>
          <li>
            <b>Tailwind v4</b> with CSS-first config + light/dark theme tokens
          </li>
          <li>
            <b>Supabase</b> — Postgres + Row Level Security + Auth + Realtime
            (the only backend service)
          </li>
          <li>
            <b>Three.js</b> for the FPS, <b>chess.js</b> for the chess engine,{" "}
            <b>Leaflet + OpenStreetMap</b> for the GeoGuessr map
          </li>
          <li>
            Sound is hand-rolled <b>Web Audio API</b> — oscillators, biquad
            filters, ambient drones. No external audio library.
          </li>
        </ul>
      </Section>

      <Section title="What was interesting to build" emoji="🛠">
        <Block
          h="Custom physics for a 3D FPS in the browser"
          p={
            <>
              Krunker is a pointer-locked FPS with WASD movement, AABB
              collision resolved per-axis, jump + crouch, FOV-scaled mouse
              sensitivity, recoil + bloom + quiescence-search bot AI, three
              weapons with distinct synth shoot sounds, hit markers,
              kill-feed, spawn protection — all in one self-contained Three.js
              scene with a single rAF loop.
            </>
          }
        />
        <Block
          h="Chess that plays decently"
          p={
            <>
              Five AI tiers from random-move &quot;Easy&quot; to a 4-ply
              minimax + alpha-beta + piece-square-tables + quiescence-search
              &quot;Grandmaster&quot;. Quiescence prevents the horizon effect
              where a fixed-depth search thinks it&apos;s winning a queen
              right before its own queen gets recaptured. The multiplayer
              version syncs as a full PGN over Supabase Realtime so threefold
              repetition + 50-move-rule detection survives every move.
            </>
          }
        />
        <Block
          h="Real-time guess-the-drawing"
          p={
            <>
              Skribbl uses Supabase channel broadcasts to ship canvas stroke
              data + chat messages between players. The drawer&apos;s strokes
              update everyone else&apos;s canvas in real time; the chat
              filters out the answer word before broadcasting; correct
              guesses fire a server-side state update that everyone picks up
              via the postgres-changes subscription.
            </>
          }
        />
        <Block
          h="Anonymous-to-full auth upgrade"
          p={
            <>
              First-time visitors get a three-option modal: sign up / log in /
              continue as guest. &quot;Guest&quot; calls{" "}
              <code>signInAnonymously()</code> — they get a real{" "}
              <code>auth.users</code> row with{" "}
              <code>is_anonymous: true</code> and a friendly random name
              (Whimsical Wombat 4815). Scores land on the global leaderboard
              from minute one. When they sign up later, the flow calls{" "}
              <code>updateUser()</code> (email) or <code>linkIdentity()</code>{" "}
              (Google) to upgrade the same user row — every score they earned
              as a guest carries over with no data migration.
            </>
          }
        />
        <Block
          h="Mobile via synthetic key events"
          p={
            <>
              The action games use keyboard input. Rather than refactor each
              one for touch, a single{" "}
              <code>&lt;TouchPad /&gt;</code> overlay dispatches synthetic{" "}
              <code>KeyboardEvent</code>s on <code>window</code> when its
              buttons are pressed. Every game&apos;s existing keyboard
              listener picks them up the same way it would a real keystroke.
              Add a game to mobile with two lines of JSX.
            </>
          }
        />
        <Block
          h="Dynamic share previews"
          p={
            <>
              Every <code>/game/&lt;slug&gt;</code> URL ships a 1200x630 OG
              card generated by Next.js&apos;s <code>ImageResponse</code> at
              request time, composed from the catalog: game gradient as
              backdrop, glyph in a rounded panel, title + short blurb, NEW /
              FEATURED ribbon. Share a link on Discord / Slack / X and you
              get a branded card instead of a bare URL.
            </>
          }
        />
        <Block
          h="Hand-rolled ambient audio per game"
          p={
            <>
              Action arcades each get their own ambient bed — Slither&apos;s
              warm triangle drone (A2-C3-E3), Agma&apos;s edgy sawtooth E♭
              minor stack, Diep&apos;s low rumble (C2-G2-C3 square wave),
              Drift King&apos;s engine sound bound to gear changes. All built
              from Web Audio oscillators + biquad filters with slow LFO-
              driven cutoff modulation. The global mute toggle propagates to
              every active drone.
            </>
          }
        />
      </Section>

      <Section title="What's honest about the gaps" emoji="📌">
        <ul className="list-disc list-inside space-y-1">
          <li>
            <b>Game-quality variance.</b> Chess, Krunker, GeoGuessr, Treasure
            Hunt are showcase pieces. Tic-Tac-Toe and Whack-a-Mole are
            simple by design to round out the catalog.
          </li>
          <li>
            <b>Catalog size.</b> 32 games is a lot for one person but a tiny
            fraction of what real portals carry.
          </li>
          <li>
            <b>Tests + benchmarks are a work in progress.</b> See the
            roadmap in the README.
          </li>
          <li>
            <b>Distribution.</b> This is a portfolio piece, not a marketing
            site — there&apos;s no SEO push, no ads, no app-store presence.
          </li>
        </ul>
      </Section>

      <div className="mt-10 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex-1">
          <div className="font-black text-base mb-0.5">
            Want to see the code?
          </div>
          <div className="text-sm text-[var(--muted)]">
            Repo is public — README has the full file map + architecture
            diagram.
          </div>
        </div>
        <Link
          href="https://github.com/techyMk/nexplay"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--foreground)] text-[var(--background)] font-bold text-sm hover:scale-[1.03] transition-transform"
        >
          GitHub →
        </Link>
      </div>
    </div>
  );
}

function Section({
  title,
  emoji,
  children,
}: {
  title: string;
  emoji: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-black mb-3 flex items-center gap-2">
        <span>{emoji}</span>
        {title}
      </h2>
      <div className="space-y-3 text-sm text-[var(--foreground-2)] leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function Block({ h, p }: { h: string; p: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="font-black mb-1">{h}</div>
      <p className="text-sm text-[var(--muted)] leading-relaxed">{p}</p>
    </div>
  );
}
