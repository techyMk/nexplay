// Tic-Tac-Toe multiplayer state stored in rooms.state (jsonb).
// Both clients read/write this shape; the server enforces RLS.

export type Cell = "X" | "O" | null;

export type TTTState = {
  board: Cell[]; // length 9
  turn: "X" | "O";
  winner: "X" | "O" | "draw" | null;
  winLine: number[] | null;
};

export const INITIAL_TTT_STATE: TTTState = {
  board: Array<Cell>(9).fill(null),
  turn: "X",
  winner: null,
  winLine: null,
};

const LINES: [number, number, number][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export function evaluateBoard(board: Cell[]): {
  winner: "X" | "O" | "draw" | null;
  winLine: number[] | null;
} {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a]!, winLine: [...line] };
    }
  }
  if (board.every((v) => v !== null)) {
    return { winner: "draw", winLine: null };
  }
  return { winner: null, winLine: null };
}

export function applyMove(state: TTTState, mark: "X" | "O", index: number): TTTState | null {
  if (state.winner) return null;
  if (state.turn !== mark) return null;
  if (state.board[index] !== null) return null;
  const board = [...state.board];
  board[index] = mark;
  const { winner, winLine } = evaluateBoard(board);
  return {
    board,
    turn: mark === "X" ? "O" : "X",
    winner,
    winLine,
  };
}

// Short, human-friendly room code (no ambiguous chars).
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
