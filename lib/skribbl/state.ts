// Shape of the Skribbl room state stored in skribbl_rooms.state (jsonb).
//
// `players` and scoring data are kept in the same row so the whole game
// state syncs through one postgres_changes UPDATE event. Live drawing
// strokes and chat are NOT here — those go through Realtime broadcast
// channels because they're high-frequency and ephemeral.

export type Phase =
  | "lobby"
  | "choosing"   // drawer picks one of three words
  | "drawing"    // drawer draws, others guess
  | "round_end"  // word reveal, brief pause
  | "finished";  // game over

export type Player = {
  user_id: string;
  display_name: string;
  avatar: string;
  score: number;
};

export type Guesser = {
  user_id: string;
  position: number; // 1-based: 1st correct guess, 2nd, etc.
  points: number;
};

export type SkribblState = {
  phase: Phase;
  round: number;            // 1-based once playing starts
  max_rounds: number;       // total rounds across the game
  draw_seconds: number;     // length of each drawing round
  drawer_order: string[];   // user_ids, fixed at game start
  drawer_index: number;     // index into drawer_order for the current turn
  drawer_id: string | null;
  word_choices: string[];   // exposed to drawer's client only (we trust the client for MVP)
  word: string | null;      // active word (drawer-only via client gating)
  word_pattern: string;     // public hint, e.g. "_ _ _ _ _"
  round_ends_at: string | null; // ISO timestamp
  guessers: Guesser[];
  players: Player[];
};

export const INITIAL_STATE: SkribblState = {
  phase: "lobby",
  round: 0,
  max_rounds: 1,
  draw_seconds: 60,
  drawer_order: [],
  drawer_index: 0,
  drawer_id: null,
  word_choices: [],
  word: null,
  word_pattern: "",
  round_ends_at: null,
  guessers: [],
  players: [],
};

/**
 * Score awarded for a correct guess. First correct guesser gets 100,
 * each subsequent guesser gets a smaller fraction. Drawer gets points
 * equal to the average of guesser scores.
 */
export function pointsForGuess(position: number): number {
  // 100, 75, 60, 50, 45, ...
  if (position <= 0) return 0;
  if (position === 1) return 100;
  return Math.max(20, Math.round(100 / (position * 0.7 + 1)));
}

export function nextDrawer(state: SkribblState): { id: string | null; index: number } {
  const idx = state.drawer_index + 1;
  if (idx >= state.drawer_order.length) return { id: null, index: idx };
  return { id: state.drawer_order[idx], index: idx };
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function generateRoomCode(length = 6): string {
  let s = "";
  const buf = new Uint8Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < length; i++) buf[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < length; i++) {
    s += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
  }
  return s;
}
