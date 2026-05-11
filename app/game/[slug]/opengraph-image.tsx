/**
 * Dynamic Open Graph image for /game/[slug].
 *
 * When someone shares a game link on Discord / X / Slack / iMessage,
 * the linked-preview crawler fetches this route and gets a 1200x630
 * PNG generated from the catalog entry for that slug — the game's
 * gradient, glyph, title, and short blurb, plus Nexplay branding.
 *
 * Next.js 16 generates the image at build time for known slugs (via
 * generateStaticParams on the page) and caches the result. Unknown
 * slugs fall through to the default `/icon` route.
 */

import { ImageResponse } from "next/og";
import { getGame } from "@/lib/catalog";

export const alt = "Nexplay game card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const game = getGame(slug);

  // Fallback if the slug isn't in the catalog — render a generic
  // Nexplay card. Should be rare in practice (only via direct URL).
  const title = game?.title ?? "Nexplay";
  const short = game?.short ?? "Play free browser games";
  const glyph = game?.glyph ?? "🎮";
  // The catalog's `gradient` is a full CSS `linear-gradient(...)`
  // string. Satori supports it directly as a `background` value.
  const gradient =
    game?.gradient ?? "linear-gradient(135deg, #7c5cff 0%, #ff5cae 100%)";
  const badge = game?.isNew ? "NEW" : game?.featured ? "FEATURED" : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: gradient,
          padding: "72px 80px",
          fontFamily: "system-ui, sans-serif",
          color: "white",
          position: "relative",
        }}
      >
        {/* Top row: Nexplay wordmark + optional badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              fontSize: 38,
              fontWeight: 900,
              letterSpacing: "-0.02em",
            }}
          >
            <span
              style={{
                width: 52,
                height: 52,
                borderRadius: 16,
                background: "rgba(255,255,255,0.18)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginRight: 16,
                fontSize: 32,
              }}
            >
              ⬢
            </span>
            Nexplay
          </div>
          {badge && (
            <div
              style={{
                display: "flex",
                fontSize: 20,
                fontWeight: 900,
                padding: "8px 18px",
                borderRadius: 999,
                background: "rgba(0,0,0,0.35)",
                letterSpacing: "0.1em",
              }}
            >
              {badge}
            </div>
          )}
        </div>

        {/* Spacer */}
        <div style={{ display: "flex", flex: 1 }} />

        {/* Body: huge glyph on left, title + blurb on right */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 56,
          }}
        >
          <div
            style={{
              width: 240,
              height: 240,
              borderRadius: 48,
              background: "rgba(0,0,0,0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 160,
              flexShrink: 0,
            }}
          >
            {glyph}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              minWidth: 0,
            }}
          >
            <div
              style={{
                fontSize: 86,
                fontWeight: 900,
                letterSpacing: "-0.025em",
                lineHeight: 1,
                marginBottom: 24,
              }}
            >
              {title}
            </div>
            <div
              style={{
                fontSize: 36,
                lineHeight: 1.25,
                opacity: 0.92,
                fontWeight: 500,
                // Cap at ~3 lines to keep the card balanced for very
                // long blurbs.
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {short}
            </div>
          </div>
        </div>

        {/* Footer hint */}
        <div
          style={{
            display: "flex",
            marginTop: 36,
            fontSize: 22,
            fontWeight: 700,
            opacity: 0.8,
            letterSpacing: "0.03em",
          }}
        >
          ▶  Play free at nexplay-games.vercel.app
        </div>
      </div>
    ),
    { ...size },
  );
}
