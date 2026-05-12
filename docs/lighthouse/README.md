# Lighthouse audit

Snapshot of the production build measured by Chrome's Lighthouse 13.3,
captured 2026-05-11. Reports live alongside this README — open the
`.report.html` files in a browser for the full interactive view.

## Scores

| Route                       | Profile | Perf | A11y | BP  | SEO |
| --------------------------- | ------- | ---- | ---- | --- | --- |
| `/` (home)                  | Desktop | 98   | 100  | 100 | 100 |
| `/` (home)                  | Mobile  | 69   | 100  | 100 | 100 |
| `/game/snake` (catalog page)| Desktop | 100  | 96   | 96  | 100 |

## Core Web Vitals (home, mobile)

| Metric                          | Value   | Target  |
| ------------------------------- | ------- | ------- |
| Largest Contentful Paint (LCP)  | 4.4 s   | < 2.5 s |
| Total Blocking Time (TBT)       | 480 ms  | < 200 ms|
| Cumulative Layout Shift (CLS)   | 0       | < 0.1   |
| First Contentful Paint (FCP)    | 1.6 s   | < 1.8 s |
| Speed Index                     | 3.9 s   | < 3.4 s |

CLS is perfect (0). TBT is the main remaining mobile bottleneck —
hydration cost on a 4× CPU-throttled profile.

## History

| Date       | Mobile Perf | LCP    | TBT    | CLS   | A11y | Notes                                                  |
| ---------- | ----------- | ------ | ------ | ----- | ---- | ------------------------------------------------------ |
| 2026-05-11 | 32          | 21 s   | 1570ms | 0.286 | 91   | Initial. 3 MB apple-touch-icon downloaded every page  |
| 2026-05-11 | 41          | 5.5 s  |  960ms | 0.286 | 91   | Resized icons (3 MB → 47 KB) + smaller logo          |
| 2026-05-11 | 71          | 4.4 s  |  480ms | 0     | 91   | Removed framer-motion, fixed WelcomeCard CLS         |
| 2026-05-12 | 69          | 4.6 s  |  530ms | 0     | 100  | Hit a11y 100 (contrast + heading order + tap targets) + added JSON-LD structured data |

## What changed during this audit pass

1. **Apple touch icon was 3 MB.** A 2000×2000 PNG referenced as
   `apple-touch-icon` and three manifest icon entries. Generated
   properly-sized variants with `sharp` (180×180, 192×192, 512×512)
   and deleted the original. The 3 MB asset was downloaded on every
   page view — biggest single perf win.
2. **Logo source PNG was 689 KB.** Displayed at 96 px wide max.
   Resized the source to 400×200 (16 KB) and added explicit `sizes`
   on the `<Image>` so next/image picks the right srcset variant
   instead of serving full-size to every viewport.
3. **Iconify 404 dragged BP to 0.** One catalog entry had an icon
   slug (`game-icons:high-jump`) that doesn't exist. A single
   network 404 is enough to fail Best Practices entirely. Removed
   the broken icon — the emoji glyph fallback was already wired up.
4. **Removed framer-motion (~227 KB chunk).** Six components used
   it for simple fade / scale / translate effects. Replaced each
   with CSS keyframes + transitions, and the scroll-reveal pattern
   with a native IntersectionObserver. TBT 960 ms → 480 ms.
5. **WelcomeCard CLS fix.** The card used to render `null` during
   SSR and pop in after hydration, pushing everything below it
   down by ~250 px. Now it renders visible by default and only
   collapses if the dismissed flag is in localStorage. CLS 0.286 → 0.
6. **A11y 91 → 100.** Three specific failures fixed:
   - Hero carousel dots were 4 px tall (failed WCAG target-size).
     Now wrapped in a 24×24 hit target with the pill visible inside.
   - `DailyStrip` used `<h3>` directly under the page `<h1>`,
     skipping `<h2>`. Bumped to `<h2>`.
   - Pink "New" and emerald "Multi" badges + cream `--muted-2`
     small caps all failed contrast on a white surface. Bumped to
     `pink-700` / `emerald-700` and added darker text variants.
7. **JSON-LD structured data.** Added WebSite schema in the root
   layout (Google sitelinks search), ItemList on the home page,
   and per-game VideoGame schema (with AggregateRating when ratings
   exist). Search engines now get rich-result-eligible records
   for every game.

## Known mobile gaps

Mobile audits use 4× CPU throttling and a slow-4G profile, which
amplifies any client-side work. The remaining mobile bottlenecks:

- **TBT 480 ms.** Down from 960 ms but still over the 200 ms target.
  Mostly React hydration of the home page client components. The
  next lever is lazy-importing the Supabase auth client on routes
  that don't need it (currently in the layout for the auth-aware
  header).
- **LCP 4.4 s.** Dominated by JS hydration cost, not asset size.
  Same fix as TBT.

The desktop profile is all-green — these aren't fundamental issues,
they're 4× CPU-throttling artifacts on the mobile preset.

## Reproducing

```bash
# Terminal A — production build + server
npm run build
PORT=3001 npm start

# Terminal B — desktop + mobile audits
npx lighthouse http://localhost:3001/ --preset=desktop \
  --output=json --output=html \
  --output-path=./docs/lighthouse/home \
  --only-categories=performance,accessibility,best-practices,seo \
  --chrome-flags="--headless=new"

npx lighthouse http://localhost:3001/ \
  --output=json --output=html \
  --output-path=./docs/lighthouse/home-mobile \
  --only-categories=performance,accessibility,best-practices,seo \
  --chrome-flags="--headless=new"
```

The reports are checked into the repo so they stay visible without
re-running. Replace them after material perf work to keep them
honest.
