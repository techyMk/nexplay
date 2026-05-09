// Connect Four multiplayer state stored in rooms.state (jsonb).
// Host plays red (1), guest plays yellow (2). 7 columns x 6 rows.

export type Cell = 0 | 1 | 2;

export const C4_COLS = 7;
export const C4_ROWS = 6;

export type C4State = {
  board: Cell[][]; // [row][col], rows 0..5 top->bottom
  turn: 1 | 2;
  winner: 1 | 2 | "draw" | null;
  winLine: [number, number][] | null;
};

function emptyBoard(): Cell[][] {
  return Array.from({ length: C4_ROWS }, () => Array<Cell>(C4_COLS).fill(0));
}

export const INITIAL_C4_STATE: C4State = {
  board: emptyBoard(),
  turn: 1,
  winner: null,
  winLine: null,
};

const DIRS: [number, number][] = [
  [0, 1], // horizontal
  [1, 0], // vertical
  [1, 1], // diagonal \
  [1, -1], // diagonal /
];

export function evaluateBoard(
  board: Cell[][],
): { winner: 1 | 2 | "draw" | null; winLine: [number, number][] | null } {
  for (let r = 0; r < C4_ROWS; r++) {
    for (let c = 0; c < C4_COLS; c++) {
      const v = board[r][c];
      if (v === 0) continue;
      for (const [dr, dc] of DIRS) {
        const cells: [number, number][] = [];
        for (let k = 0; k < 4; k++) {
          const nr = r + dr * k;
          const nc = c + dc * k;
          if (nr < 0 || nr >= C4_ROWS || nc < 0 || nc >= C4_COLS) break;
          if (board[nr][nc] !== v) break;
          cells.push([nr, nc]);
        }
        if (cells.length === 4) return { winner: v, winLine: cells };
      }
    }
  }
  // Draw if top row is full and no winner
  if (board[0].every((c) => c !== 0)) return { winner: "draw", winLine: null };
  return { winner: null, winLine: null };
}

/** Returns the new state if the drop is legal, else null. */
export function applyDrop(
  state: C4State,
  mark: 1 | 2,
  col: number,
): C4State | null {
  if (state.winner) return null;
  if (state.turn !== mark) return null;
  if (col < 0 || col >= C4_COLS) return null;
  if (state.board[0][col] !== 0) return null; // column full

  const board = state.board.map((row) => [...row] as Cell[]);
  for (let r = C4_ROWS - 1; r >= 0; r--) {
    if (board[r][col] === 0) {
      board[r][col] = mark;
      const { winner, winLine } = evaluateBoard(board);
      return {
        board,
        turn: mark === 1 ? 2 : 1,
        winner,
        winLine,
      };
    }
  }
  return null;
}
