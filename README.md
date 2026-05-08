# Nexplay

A free browser-game hub — like Poki — built with Next.js, Tailwind, and Supabase.

## Quickstart

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The catalog and all 12 games work out of the box. **Auth, profiles, and leaderboards** require a Supabase project (~2 min to set up — see below). Without Supabase env vars set, those features show a "Setup needed" notice and the rest of the site is unaffected.

## Project structure

```
app/                         Next.js routes (App Router)
  page.tsx                   Homepage
  category/[slug]/           Category browse pages
  game/[slug]/               Game play pages
  search/                    Search results
  login/                     Login + signup
  profile/                   Logged-in user profile
  leaderboard/[slug]/        Per-game leaderboards
  api/scores/                Score submission endpoint
  logout/                    POST to sign out
components/                  Header, AuthMenu, GameCard, GameFrame, ...
games/                       Self-contained custom games
  registry.tsx               Slug -> dynamic component map
  tic-tac-toe/, snake/, 2048/, ... 11 games
lib/
  catalog.ts                 Game catalog seed data
  supabase/                  Auth clients (browser, server, middleware)
  scores.ts                  Client hook for score submission
supabase/migrations/         SQL schema (run in Supabase SQL editor)
middleware.ts                Refreshes Supabase auth cookies
```

## Setting up Supabase (optional but recommended)

1. Create a free project at [supabase.com](https://supabase.com).
2. In **Project Settings → API**, copy:
   - the **Project URL**
   - the **anon public** key
3. Create `.env.local` in the project root:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-REF.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```

4. Open the Supabase **SQL editor** and paste the contents of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql). Run it.
5. (Optional) In **Authentication → Providers → Email**, you can disable "Confirm email" for faster local testing.
6. Restart `npm run dev`.

You should now see a **Log in** button in the header. Sign up, play Snake, get a score — your run is saved and appears on `/leaderboard/snake`.

## Games

| Slug             | Title         | Type            | Score on leaderboard? |
| ---------------- | ------------- | --------------- | --------------------- |
| `tic-tac-toe`    | Tic-Tac-Toe   | vs AI           | —                     |
| `snake`          | Snake         | Single-player   | yes                   |
| `2048`           | 2048          | Single-player   | yes                   |
| `connect-four`   | Connect Four  | vs AI           | —                     |
| `pong`           | Pong          | Local 2P        | —                     |
| `memory-match`   | Memory Match  | Single-player   | —                     |
| `flappy`         | Flappy        | Single-player   | yes                   |
| `checkers`       | Checkers      | Local 2P        | —                     |
| `drift-king`     | Drift King    | Single-player   | yes                   |
| `neon-runner`    | Neon Runner   | Single-player   | yes                   |
| `treasure-hunt`  | Treasure Hunt | Single-player   | yes                   |
| `hextris`        | Hextris       | External embed  | —                     |

Adding a new game:

1. Create `games/<slug>/Game.tsx` (a default-exported client component, absolutely-positioned to fill its parent).
2. Add the entry to `CUSTOM_GAMES` in [`games/registry.tsx`](games/registry.tsx).
3. Add the metadata to `GAMES` in [`lib/catalog.ts`](lib/catalog.ts).
4. To save scores: `const status = useSubmitScoreOnGameOver(slug, score, gameOver)` and render `<ScoreStatus gameSlug={slug} status={status} />`.

## Tech

- **Next.js 16** App Router + Turbopack
- **React 19**
- **Tailwind v4** (CSS-first config in `app/globals.css`)
- **Supabase** for auth + Postgres + RLS-protected score submission
- **TypeScript** strict mode

## Deploy

Push to a Git repo and deploy on Vercel. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as environment variables in your Vercel project. That's it.
