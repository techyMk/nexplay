# Lighthouse audit

Snapshot of the production build measured by Chrome's Lighthouse 13.3,
captured 2026-05-11. Reports live alongside this README — open the
`.report.html` files in a browser for the full interactive view.

## Scores

| Route                       | Profile | Perf | A11y | BP  | SEO |
| --------------------------- | ------- | ---- | ---- | --- | --- |
| `/` (home)                  | Desktop | 95   | 92   | 100 | 100 |
| `/` (home)                  | Mobile  | 41   | 92   | 100 | 100 |
| `/game/snake` (catalog page)| Desktop | 100  | 96   | 96  | 100 |

## Core Web Vitals (home, mobile)

| Metric                          | Value   | Target  |
| ------------------------------- | ------- | ------- |
| Largest Contentful Paint (LCP)  | 5.5 s   | < 2.5 s |
| Total Blocking Time (TBT)       | 960 ms  | < 200 ms|
| Cumulative Layout Shift (CLS)   | 0.286   | < 0.1   |
| First Contentful Paint (FCP)    | 1.3 s   | < 1.8 s |
| Speed Index                     | 2.4 s   | < 3.4 s |

Desktop scores all green. Mobile has known gaps — see below.

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

## Known mobile gaps

Mobile audits use 4× CPU throttling and a slow-4G profile, which
amplifies any client-side work. The remaining mobile bottlenecks:

- **TBT 960 ms.** Mainly React hydration of the home page (~3 MB of
  JS uncompressed, ~250 KB gzipped). Realistic optimisations:
  - Defer framer-motion below-the-fold animations (it's loaded
    eagerly by six components, ~227 KB chunk, ~35 % unused)
  - Lazy-import the Supabase auth client on routes that don't need
    it (it's currently in the layout for the auth-aware header)
- **CLS 0.286.** Hero card and bento grid items reflow as their
  client-side data arrives. Reservable: skeleton placeholders with
  fixed heights matching the final content.
- **LCP 5.5 s.** Dominated by the JS hydration cost, not asset
  size. Same fixes as TBT.

The desktop profile shows these aren't fundamental issues — the
production assets and code paths are fine on a typical laptop.
Squeezing mobile perf above ~70 needs an architectural pass on
hydration, not micro-optimisations.

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
