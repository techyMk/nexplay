// Chess multiplayer state stored in rooms.state (jsonb).
//
// We encode the full game as a PGN string — chess.js can serialise +
// parse it round-trip and PGN is the chess-native format for "the
// game so far". From PGN we can reconstruct the position, derive the
// side to move, build the move list, detect draws/mate, etc. Saving
// the PGN (rather than the FEN) preserves history, which is required
// for threefold-repetition and 50-move-rule detection.
//
// Convention: host plays white, guest plays black. This is a simple
// rule that avoids race conditions over "who picks first"; for variety
// the host can swap by leaving and rejoining or by creating a new
// room.

export type ChessOnlineWinner = "w" | "b" | "draw" | null;

export type ChessOnlineReason =
  | "checkmate"
  | "stalemate"
  | "resign"
  | "repetition"
  | "material"
  | "fifty"
  | null;

export type ChessOnlineState = {
  /** PGN-encoded move list. Empty string at game start. */
  pgn: string;
  status: "playing" | "finished";
  winner: ChessOnlineWinner;
  reason: ChessOnlineReason;
};

export const INITIAL_CHESS_STATE: ChessOnlineState = {
  pgn: "",
  status: "playing",
  winner: null,
  reason: null,
};
