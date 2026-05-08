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
  /** Two-letter / emoji glyph rendered on the thumbnail */
  glyph: string;
  source: GameSource;
  /** For embed: external iframe URL. For custom: ignored (uses /games/[slug]). */
  url?: string;
  controls: string[];
  players: GamePlayers;
  featured?: boolean;
  isNew?: boolean;
  rating: number;
  plays: number;
};

export type Category = {
  slug: string;
  title: string;
  emoji: string;
  description: string;
};
