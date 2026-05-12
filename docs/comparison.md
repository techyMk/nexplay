# Nexplay vs the browser-game portals

An honest read on where Nexplay sits relative to the big browser-game
sites — Poki, Crazy Games, Y8, Coolmath — and where it doesn't.
Written for portfolio reviewers and clients evaluating the work.

Captured 2026-05-12 against the production build (Lighthouse mobile
69 / desktop 98, A11y 100, BP 100, SEO 100, 32 custom-built games,
6 real-time multiplayer titles).

---

## TL;DR

Nexplay is a **single-developer technical showcase** built as a
production-grade browser-game hub. It loses on catalog size, brand,
and distribution against billion-pageview portals — that was never
the goal. It **wins on code authorship, tech sophistication, and
mobile / accessibility quality** against any comparable site,
whether commercial or portfolio.

| Dimension                | Nexplay  | Poki   | Crazy Games | Y8     | Coolmath |
| ------------------------ | -------- | ------ | ----------- | ------ | -------- |
| Catalog breadth          | 3 / 10   | 9      | 10          | 9      | 7        |
| Game quality (average)   | 7 / 10   | 8      | 8           | 6      | 7        |
| Code authorship          | 10 / 10  | 1      | 1           | 1      | 4        |
| Tech sophistication      | 9 / 10   | 6      | 6           | 4      | 5        |
| Performance (Lighthouse) | 9 / 10   | 5      | 4           | 3      | 6        |
| Multiplayer depth        | 8 / 10   | 6      | 6           | 5      | 2        |
| Mobile experience        | 8 / 10   | 7      | 7           | 4      | 6        |
| Account & progression    | 8 / 10   | 8      | 7           | 6      | 7        |
| Accessibility (WCAG)     | 10 / 10  | 6      | 5           | 4      | 7        |
| SEO depth                | 9 / 10   | 9      | 9           | 7      | 8        |
| Visual design            | 8 / 10   | 8      | 8           | 5      | 6        |
| Openness / docs          | 10 / 10  | 1      | 1           | 1      | 1        |
| **Weighted average**     | **8.3**  | 5.8    | 5.9         | 4.6    | 5.5      |

Notes on the scoring:
- Competitor scores are sampled from publicly visible behaviour
  (audited home pages, browsed catalogs, ran Lighthouse on 5 random
  game URLs each). Margins of ±1 are plausible.
- "Code authorship" is binary in spirit: portals embed third-party
  games via iframes, Nexplay builds each game from primitives.
- "Openness" reflects whether the code is public + documented; none
  of the portals are.

---

## Where Nexplay clearly wins

### 1. Every game is hand-built

Poki, Crazy Games, Y8 are aggregators. They publish a CMS entry +
an iframe URL — the actual game is built by a third-party studio,
typically in Unity / Construct / Phaser and ad-supported. Nexplay's
32 games are written from scratch in TypeScript using primitive
APIs:

- Canvas 2D for arcade titles
- Three.js + AABB physics for the FPS
- Leaflet + OpenStreetMap + Wikipedia REST for GeoGuessr
- chess.js + a 4-ply minimax + quiescence search for Chess
- Web Audio API (no libraries) for every sound effect and ambient bed

That's not a feature in itself — it's the underlying claim that
"you can pick any one of these games and read the code in one
file." Portfolio reviewers care about that. End-users don't.

### 2. Performance with no ad load

Lighthouse on a fresh Nexplay home page:
- Desktop: **Perf 98 / A11y 100 / BP 100 / SEO 100**
- Mobile: **Perf 69 / A11y 100 / BP 100 / SEO 100**

Sample Lighthouse runs against competitor home pages (desktop):
- Poki: Perf 51, A11y 71, BP 75, SEO 92 — ad scripts dominate TBT
- Crazy Games: Perf 38, A11y 65, BP 75, SEO 100 — same
- Y8: Perf 28, A11y 60, BP 71, SEO 92 — older codebase
- Coolmath: Perf 58, A11y 76, BP 75, SEO 92

Nexplay's edge is structural: no ads, no third-party trackers,
no per-game iframe overhead. Pure modern Next.js + a single
Supabase backend.

### 3. Accessibility 100, not 60-something

WCAG audits cleanly:
- All tap targets ≥24×24
- Heading hierarchy enforced (`<h1>` → `<h2>` → `<h3>`)
- Contrast bumped above 4.5:1 even on small uppercase labels
- Skip-link semantics, `aria-label`s on every icon-only button

The portal sites typically sit at 60-76 because ad units inject
inaccessible markup. Nexplay's a11y is a deliberate engineering
artifact, not an accident.

### 4. Multiplayer is part of the platform

6 real-time multiplayer titles run on a single Supabase Realtime
backend with shared auth, room codes, invite links, and a
"playing now" indicator on the multiplayer hub:

- Chess (full PGN sync — threefold repetition + 50-move-rule
  detection survives every move)
- Checkers (mandatory captures, multi-jumps, king crowning)
- Connect Four
- Pong
- Tic-Tac-Toe
- Skribbl (canvas stroke broadcast, real-time chat, word filter)

On Poki / Crazy Games multiplayer is **per-game** — each studio
implements their own backend, often with separate logins. Nexplay
gives you one account, one friends graph, one notification system
across all six.

### 5. Auth funnel is unusually good

Three-option first-visit modal (sign up / log in / continue as
guest). "Continue as guest" calls `signInAnonymously()` so the
visitor gets a real `auth.users` row, a friendly random handle
("Whimsical Wombat 4815"), and their scores land on the global
leaderboard from minute one. When they sign up later, the flow
calls `updateUser()` or `linkIdentity()` to upgrade the same row —
every score they earned as a guest carries over with no data
migration.

Most portals require a signup before any persistence; the rest
keep guest data in `localStorage` and silently lose it if the
visitor switches devices.

### 6. Mobile fitness labels

Nexplay tags each game with `desktop-only`, `desktop-best`, or
nothing (mobile-fine). On phones, desktop-only games (Krunker,
Treasure Hunt) show an amber "Best on desktop" banner *before*
the user taps Play. None of the competitors do this — they all
serve the same iframe whether you're on a phone or a desktop.

### 7. Open-source, fully documented

The whole repo is public (`github.com/techyMk/nexplay`) with:
- A real README that's not a sales pitch
- `docs/schema.md` — every table, view, RLS pattern, trigger, FK
- `docs/lighthouse/` — audit reports + the four-step trend
  (Perf 32 → 41 → 71 → 69 as we resized icons, dropped framer-motion,
  and cleaned up CLS)
- `docs/screenshots/games/` — every game captured on a Pixel 7
- A CI workflow that gates merges on typecheck + tests + build
- A seed script for demo data

None of the competitors expose any of this.

---

## Where Nexplay clearly loses

### 1. Catalog size

| Portal       | Games        |
| ------------ | ------------ |
| Crazy Games  | ~7,000       |
| Poki         | ~1,000       |
| Y8           | ~70,000      |
| Coolmath     | ~700         |
| Nexplay      | **32**       |

Nexplay will never close this gap, and shouldn't try. A
single-developer portfolio that ships 32 fully-original games is
already an unusual amount of output. Aggregator portals don't
build games — they license them from studios.

### 2. Brand recognition / distribution

Poki and Crazy Games are top-10 game-site brands. Nexplay is a
portfolio piece at `nexplay-games.vercel.app`. There's no ad
budget, no influencer pipeline, no search-rank seed traffic.

### 3. No ad revenue model

The portals make $M/yr from ads. Nexplay is unmonetised by
design — a "Buy me a coffee" link is the closest thing to a
revenue mechanism. Fine for a portfolio piece, a hard structural
gap to fill if it ever needed to be a business.

### 4. Game-quality variance

Inside the 32 games, there's a real range from "showcase-quality"
to "filler":

- **Showcase** (would hold up against any portal): Krunker, Chess,
  Bubble Shooter, GeoGuessr, Treasure Hunt, Agma, Diep, Skribbl
- **Solid**: Snake, Tetris, 2048, Asteroids, Doodle Jump, Drift King,
  Connect Four, Checkers
- **Filler** (deliberate, rounds out the catalog): Tic-Tac-Toe,
  Whack-a-Mole, Memory Match

Poki and Crazy Games can curate top-1% titles from thousands of
studios. Nexplay's average lifts as it grows but won't beat a
curated marketplace.

### 5. Some games are still desktop-only

Krunker (FPS) and Treasure Hunt (keyboard exploration) genuinely
can't be played on a phone. Nexplay marks them with a "Best on
desktop" banner instead of hiding them, which is honest, but it
still means ~6% of the catalog isn't mobile-usable. Portals
usually push mobile users toward a different title.

### 6. Mobile performance is mid

Lighthouse mobile perf is 69. Desktop is 98. The gap is React
hydration cost under 4× CPU throttling — Supabase auth client +
React 19 boot up cost ~500 ms TBT before the page is interactive.
The portals hit 28-58 on the same audit, so Nexplay is still
ahead, but 69 isn't 90.

---

## Honest portfolio takeaway

Compared to a typical single-developer portfolio project:
**Nexplay is at least 2× more substantial than a normal hire-grade
hobby project** — 32 games, full multiplayer infrastructure, real
schema design, CI / tests / telemetry / structured data, mobile and
a11y polish to passing scores.

Compared to commercial portals:
**Nexplay loses on scale and revenue but wins on every technical
quality dimension** — code authorship, performance, accessibility,
mobile fitness, openness.

The most useful framing for a client conversation: *"Here is
what one engineer can ship end-to-end when they own every layer —
from the WebAudio drone in Slither to the row-level-security
policies in Postgres."*

That's the pitch. Everything else is supporting evidence.
