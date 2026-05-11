# Nexplay

A modern browser-game hub — **every game is custom-built**, no third-party iframes. 32 games across action, puzzle, strategy, arcade, racing, and adventure, plus 6 real-time multiplayer titles, all wrapped in a full account / leaderboards / achievements / daily-challenges layer.

Built as a single-developer project to demonstrate end-to-end product engineering: custom game implementations across multiple rendering paradigms, full-stack with Supabase, real-time multiplayer over WebSocket channels, modern auth (anonymous-to-full upgrade), mobile touch controls, PWA installability, dynamic OG cards per game, dark/light theming, error boundaries, and 30+ other production-grade details. **Live at [nexplay-games.vercel.app](https://nexplay-games.vercel.app)**.

---

## What's interesting under the hood

| Area | Highlight |
| --- | --- |
| **Custom game engines** | Canvas 2D (most action games), Three.js + AABB physics (Krunker FPS), Leaflet + Wikipedia REST (GeoGuessr), chess.js + 4-ply minimax with quiescence (Chess), single-rAF loops with custom physics integrators for everything else |
| **Real-time multiplayer** | 6 games over Supabase Realtime channels with `postgres_changes` + polling fallback. Skribbl includes a stroke-broadcast canvas; chess preserves full PGN so threefold-repetition + 50-move-rule detection works |
| **Auth funnel** | Three-option modal (sign up / log in / continue as guest). "Guest" calls `signInAnonymously()` so they get a real `auth.users` row — scores land on the global leaderboard immediately. Sign-up uses `updateUser` / `linkIdentity` to upgrade the same row, preserving all guest data |
| **Audio** | Hand-rolled Web Audio API system: oscillator chord ambience with low-pass filter modulation per game, MVV-LVA-ordered shoot/match/hit effects, global mute that propagates to every active ambient bed |
| **Mobile** | Shared `<TouchPad>` component dispatches synthetic `keydown`/`keyup` events on `window` so keyboard-driven games (Drift King, Asteroids, Doodle Jump) work on phones with zero per-game refactor |
| **SEO** | Dynamic Open Graph images at `app/game/[slug]/opengraph-image.tsx` — Next.js generates 1200x630 PNG per game from the catalog at build/cache time using `next/og`. Sitemap + robots.txt also generated |
| **PWA** | Manifest + apple-web-app + dynamic theme-color make Nexplay installable as a standalone app on iOS / Android / Chromium desktop |
| **Performance** | Per-game dynamic imports keep Three.js, leaflet, chess.js out of the home bundle. Catalog (~650 lines) stays server-side; client components take `gameCount` props instead of importing the whole list |
| **Edge cases handled** | Custom 404, full app error boundary with retry, sticky-nav `overflow-x: clip` fix, key-stuck-on-blur clearing for FPS, FOV-scaled mouse sens when scoping, recoil-decoupled aim, AABB collision per-axis, etc. |

---

## Tech stack

- **Framework**: Next.js 16 (App Router, Turbopack), React 19
- **Language**: TypeScript strict
- **Styling**: Tailwind v4 (CSS-first config in `app/globals.css`)
- **Backend**: Supabase (Postgres + RLS + Auth + Realtime + Storage)
- **3D**: Three.js (Krunker)
- **Maps**: Leaflet + OpenStreetMap tiles (GeoGuessr)
- **Chess rules**: chess.js
- **Animation**: Framer Motion (sparing)
- **Deploy**: Vercel
- **Sound**: Web Audio API (custom, no external libs)

No external game libraries — every game is implemented from primitives.

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                       Next.js App Router                        │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │  Server pages   │  │  Client games    │  │  API routes  │  │
│  │  (catalog list, │  │  (dynamic, one   │  │  (scores,    │  │
│  │   profile,      │  │   chunk each)    │  │   plays,     │  │
│  │   leaderboard)  │  │                  │  │   ratings)   │  │
│  └────────┬────────┘  └────────┬─────────┘  └──────┬───────┘  │
│           │                    │                    │           │
│           └────────────────────┴────────────────────┘           │
│                                │                                │
└────────────────────────────────┼────────────────────────────────┘
                                 │
                  ┌──────────────┴──────────────┐
                  │     Supabase Postgres       │
                  │  ┌───────────────────────┐  │
                  │  │ auth.users (incl.     │  │
                  │  │   is_anonymous flag)  │  │
                  │  │ profiles              │  │
                  │  │ scores                │  │
                  │  │ game_plays            │  │
                  │  │ game_ratings          │  │
                  │  │ achievements          │  │
                  │  │ daily_challenge_      │  │
                  │  │   completions         │  │
                  │  │ rooms (multiplayer)   │  │
                  │  │ skribbl_rooms         │  │
                  │  │ friendships           │  │
                  │  │ game_invites          │  │
                  │  └───────────────────────┘  │
                  │                             │
                  │   + Realtime channels for   │
                  │     postgres_changes        │
                  │     broadcast (stroke sync) │
                  └─────────────────────────────┘
```

Every server-side action goes through Supabase's RLS-protected client — no service-role key on the edge.

---

## Quickstart

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The catalog and all single-player games work out of the box. **Auth, profiles, leaderboards, achievements, and multiplayer** require a Supabase project (~5 min to set up — see below).

---

## Supabase setup

1. Create a free project at [supabase.com](https://supabase.com).
2. In **Project Settings → API**, copy:
   - the **Project URL**
   - the **anon public** key
3. Create `.env.local`:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-REF.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   NEXT_PUBLIC_SITE_URL=http://localhost:3000   # for OG image absolute URLs
   ```

4. Open the Supabase **SQL editor** and run each file in `supabase/migrations/` in order.
5. In **Authentication → Providers**, enable Google (and any others you want).
6. (Recommended for the auth funnel) In **Authentication → Settings → User Signups**, enable **"Allow anonymous sign-ins"**.
7. Restart `npm run dev`.

---

## Game catalog

32 custom games. Single-player games submit to the global leaderboard via `useSubmitScoreOnGameOver(slug, score, gameOver)` and render `<ScoreStatus />`. Multiplayer rooms persist to the `rooms` (or `skribbl_rooms`) table and use Supabase Realtime for state sync.

| Genre | Games |
| --- | --- |
| **Action / FPS** | Krunker (Three.js, AABB physics, 4 difficulty bots, hitmarker, ADS, recoil + bloom, killfeed) |
| **Arcade** | Snake, Tetris, Asteroids, Breakout, Bubble Shooter, Flappy, Chrome Dino, Neon Runner, Doodle Jump, Hextris, Match-3, Whack-a-Mole |
| **Puzzle** | 2048, Memory Match, Sudoku, Tower of Hanoi, Minesweeper, Wordle (daily + free play) |
| **Strategy** | Chess (4-ply minimax + quiescence + PST), Checkers, Connect Four, Tic-Tac-Toe |
| **Racing** | Drift King (top-down arcade, traffic AI, engine sound synth) |
| **Adventure** | Treasure Hunt (3 themed maps + ambience), GeoGuessr (curated landmarks + Leaflet OSM) |
| **.io clones** | Agar, Agma (with viruses + splits + mass eject), Slither, Diep |
| **Multiplayer** | Chess, Checkers, Connect Four, Pong, Skribbl (real-time draw + guess), Tic-Tac-Toe |

### Adding a new game

1. Create `games/<slug>/Game.tsx` — a default-exported client component that fills its parent (`absolute inset-0`).
2. Add the dynamic import to `games/registry.tsx`.
3. Add a catalog entry to `lib/catalog.ts`.
4. (Optional) Hook score submission: `useSubmitScoreOnGameOver(slug, score, gameOver)` + render `<ScoreStatus />`.
5. (Optional) For touch support on keyboard games, drop a `<TouchPad>` overlay inside the canvas wrapper.

---

## Notable file map

```
app/
  layout.tsx                        root layout, theme, OG defaults
  page.tsx                          home (Hero + DailyStrip + BentoGrid + ...)
  not-found.tsx                     custom 404
  error.tsx                         app error boundary
  manifest.ts                       PWA manifest
  sitemap.ts                        SEO sitemap
  robots.ts                         crawler hints
  game/[slug]/
    page.tsx                        per-game page
    opengraph-image.tsx             dynamic OG card (1200x630 PNG)
    twitter-image.tsx               same generator, twitter:card
  multiplayer/
    page.tsx                        hub with live-rooms count
    chess/                          full multiplayer chess
    checkers/, connect-four/,
    pong/, tic-tac-toe/, skribbl/   other multiplayer rooms
  leaderboard/[slug]/page.tsx
  daily/page.tsx
  achievements/page.tsx
  profile/page.tsx
  api/
    scores/route.ts                 POST: submit score (rate-limited)
    plays/route.ts                  POST: record play
    ratings/route.ts                POST: rate a game

games/
  registry.tsx                      slug → dynamic component map
  <slug>/Game.tsx                   the games themselves

components/
  Header.tsx, Sidebar.tsx           navigation
  AuthChoiceModal.tsx               first-visit auth gate
  GuestScoreMigration.tsx           legacy → user score migration
  WelcomeCard.tsx                   first-time onboarding
  ThemeToggle.tsx                   light/dark/system
  games/
    GameOverlay.tsx                 shared start/pause/end overlays
    TouchPad.tsx                    on-screen controls for mobile

lib/
  catalog.ts                        game metadata (32 entries)
  scores.ts                         useSubmitScoreOnGameOver hook
  sound.ts                          Web Audio API + Sfx presets + createAmbience
  daily.ts, achievements.ts         engagement systems
  chess-online.ts, checkers.ts      multiplayer state types
  guest.ts                          random guest name generator
  supabase/                         client + server clients
```

---

## Honest known gaps

A portfolio piece should be transparent about what's missing. As of this writing:

- **Test coverage is thin.** 44 tests covering pure logic (daily challenges, checkers, connect-four, catalog, formatters). No React-render or e2e tests yet — `npm test` runs the suite and CI gates on it.
- **Production error monitoring is env-gated.** A lightweight telemetry client posts to Sentry's HTTP ingest when `NEXT_PUBLIC_SENTRY_DSN` is set; otherwise it's silent.
- **Game-quality variance.** Chess, Krunker, Bubble Shooter, Treasure Hunt, GeoGuessr, Agma are showcase pieces. Tic-Tac-Toe, Whack-a-Mole, Memory Match are deliberately simpler — they exist to round out the catalog.
- **Mobile Lighthouse perf is 71 / 100.** Desktop is 93-100. The remaining mobile gap is React-hydration TBT (480 ms) — the next lever is lazy-importing Supabase on routes that don't need it. CLS is 0 and BP / SEO are 100. See `docs/lighthouse/` for the trend over the last few passes.
- **Mobile not fully tested.** Touch works for the keyboard-only games; layouts are responsive; not yet validated against every real device.
- **No i18n.** Every string is English.
- **React Compiler warnings.** The new `eslint-plugin-react-hooks` v7 ships compiler-aware style rules (`react-hooks/refs`, `set-state-in-effect`, `immutability`, `purity`). These are downgraded to warnings — they're stylistic hints, not bugs. CI still gates on the actually-correctness-related rules.

---

## Docs & scripts

- `docs/schema.md` — full Postgres data model (tables, views, RLS patterns, triggers, migration order)
- `docs/lighthouse/` — Lighthouse audit reports + reproduction instructions
- `tests/` — vitest suite for pure-logic library code (44 tests)
- `scripts/seed.ts` — `npm run seed` populates the DB with 20 demo users + plausible scores so leaderboards aren't empty (requires `SUPABASE_SERVICE_ROLE_KEY`)
- `.github/workflows/ci.yml` — typecheck + test + build gate on every push / PR to `main`

---

## Deploy

Push to a Git repo and deploy on Vercel. Required env vars:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SITE_URL          (for OG image absolute URLs — e.g. https://nexplay-games.vercel.app)
```

Optional:

```
NEXT_PUBLIC_SENTRY_DSN        (enables error monitoring)
```

---

## License

Personal portfolio project. No license assigned — please ask before reusing substantial portions.
