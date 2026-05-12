export type GameSource = "custom" | "embed";

export type GamePlayers = "single" | "multiplayer" | "both";

export type Game = {
  slug: string;
  title: string;
  short: string;
  description: string;
  categories: string[];
  tags: string[];
  /** CSS gradient used as the thumbnail background */
  gradient: string;
  /** Two-letter / emoji glyph rendered on the thumbnail (fallback) */
  glyph: string;
  /**
   * Optional Iconify icon name (e.g. "game-icons:snake") used as the primary
   * thumbnail. If unset or fails to load, the emoji `glyph` is shown.
   */
  icon?: string;
  source: GameSource;
  /** For embed: external iframe URL. For custom: ignored (uses /games/[slug]). */
  url?: string;
  controls: string[];
  players: GamePlayers;
  featured?: boolean;
  isNew?: boolean;
  rating: number;
  plays: number;
  /**
   * Mobile fitness tag. Surfaced in the UI when set:
   *   • "desktop-only" — game needs mouse+keyboard / pointer lock /
   *     fine mouse motion. We still let players open it on mobile
   *     but warn them up-front with a banner.
   *   • "desktop-best" — playable on touch but designed for a bigger
   *     screen (mouse aim, dense HUD, etc). A subtle pill in the
   *     catalog tells users it shines on desktop.
   * If unset, the game plays comfortably on phones — the default.
   */
  mobileFitness?: "desktop-only" | "desktop-best";
};

export type Category = {
  slug: string;
  title: string;
  emoji: string;
  description: string;
};
