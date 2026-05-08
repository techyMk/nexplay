"use client";

import { useState } from "react";

/**
 * Renders a game's thumbnail art. If `icon` is provided we load an Iconify
 * SVG (game-icons.net via api.iconify.design — free, CC-BY 3.0, served from
 * a global CDN). If the icon fails to load, falls back to the emoji `glyph`.
 *
 * Usage: <GameArt icon={game.icon} glyph={game.glyph} size="md" />
 */
export function GameArt({
  icon,
  glyph,
  size = "md",
  color = "#ffffff",
}: {
  icon?: string;
  glyph: string;
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  color?: string;
}) {
  const [errored, setErrored] = useState(false);
  const showIcon = icon && !errored;

  const dim = {
    sm: 48,
    md: 80,
    lg: 120,
    xl: 200,
    hero: 280,
  }[size];

  if (showIcon) {
    const url = `https://api.iconify.design/${icon}.svg?color=${encodeURIComponent(color)}`;
    return (
      <img
        src={url}
        alt=""
        width={dim}
        height={dim}
        loading="lazy"
        onError={() => setErrored(true)}
        className="select-none"
        style={{
          width: dim,
          height: dim,
          filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.45))",
        }}
        draggable={false}
      />
    );
  }

  // Emoji fallback — sized to match
  const fontSize = {
    sm: "2.5rem",
    md: "3.5rem",
    lg: "5rem",
    xl: "7rem",
    hero: "10rem",
  }[size];

  return (
    <span
      className="select-none leading-none"
      style={{
        fontSize,
        filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.45))",
      }}
    >
      {glyph}
    </span>
  );
}
