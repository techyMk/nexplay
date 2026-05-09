// Checkers (American/English draughts) multiplayer state stored in
// rooms.state (jsonb). 8x8 board, mandatory captures, multi-jumps,
// kings can move and capture in all four diagonal directions.
//
// Player 1 starts at the top (rows 0-2) and moves toward higher rows.
// Player 2 starts at the bottom (rows 5-7) and moves toward lower rows.

export const C_SIZE = 8;

export type Piece = { player: 1 | 2; king: boolean };
export type Cell = Piece | null;
export type Pos = [number, number]; // [row, col]

export type Move = {
  from: Pos;
  to: Pos;
  captures: Pos[]; // mid-squares jumped over
};

export type CheckersState = {
  board: Cell[][]; // [row][col]
  turn: 1 | 2;
  winner: 1 | 2 | "draw" | null;
  // When a multi-jump is in progress, the piece's current position. Only
  // further jumps from that exact square are legal until the chain ends.
  jumpChain: Pos | null;
  lastMove: Move | null;
};

function emptyBoard(): Cell[][] {
  return Array.from({ length: C_SIZE }, () => Array<Cell>(C_SIZE).fill(null));
}

function isDark(r: number, c: number): boolean {
  return (r + c) % 2 === 1;
}

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < C_SIZE && c >= 0 && c < C_SIZE;
}

function startingBoard(): Cell[][] {
  const b = emptyBoard();
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < C_SIZE; c++) {
      if (isDark(r, c)) b[r][c] = { player: 1, king: false };
    }
  }
  for (let r = C_SIZE - 3; r < C_SIZE; r++) {
    for (let c = 0; c < C_SIZE; c++) {
      if (isDark(r, c)) b[r][c] = { player: 2, king: false };
    }
  }
  return b;
}

export const INITIAL_CHECKERS_STATE: CheckersState = {
  board: startingBoard(),
  turn: 1,
  winner: null,
  jumpChain: null,
  lastMove: null,
};

function dirs(piece: Piece): [number, number][] {
  const fwd: 1 | -1 = piece.player === 1 ? 1 : -1;
  if (piece.king) {
    return [
      [1, -1],
      [1, 1],
      [-1, -1],
      [-1, 1],
    ];
  }
  return [
    [fwd, -1],
    [fwd, 1],
  ];
}

function findJumpsFrom(board: Cell[][], r: number, c: number): Move[] {
  const piece = board[r][c];
  if (!piece) return [];
  const out: Move[] = [];
  for (const [dr, dc] of dirs(piece)) {
    const mr = r + dr;
    const mc = c + dc;
    const tr = r + 2 * dr;
    const tc = c + 2 * dc;
    if (!inBounds(tr, tc)) continue;
    const mid = board[mr][mc];
    if (!mid || mid.player === piece.player) continue;
    if (board[tr][tc]) continue;
    out.push({ from: [r, c], to: [tr, tc], captures: [[mr, mc]] });
  }
  return out;
}

function findStepsFrom(board: Cell[][], r: number, c: number): Move[] {
  const piece = board[r][c];
  if (!piece) return [];
  const out: Move[] = [];
  for (const [dr, dc] of dirs(piece)) {
    const tr = r + dr;
    const tc = c + dc;
    if (!inBounds(tr, tc)) continue;
    if (board[tr][tc]) continue;
    out.push({ from: [r, c], to: [tr, tc], captures: [] });
  }
  return out;
}

export function legalMoves(state: CheckersState, player: 1 | 2): Move[] {
  if (state.winner) return [];
  if (state.turn !== player) return [];

  if (state.jumpChain) {
    const [r, c] = state.jumpChain;
    return findJumpsFrom(state.board, r, c);
  }

  const jumps: Move[] = [];
  for (let r = 0; r < C_SIZE; r++) {
    for (let c = 0; c < C_SIZE; c++) {
      const p = state.board[r][c];
      if (!p || p.player !== player) continue;
      jumps.push(...findJumpsFrom(state.board, r, c));
    }
  }
  if (jumps.length > 0) return jumps;

  const steps: Move[] = [];
  for (let r = 0; r < C_SIZE; r++) {
    for (let c = 0; c < C_SIZE; c++) {
      const p = state.board[r][c];
      if (!p || p.player !== player) continue;
      steps.push(...findStepsFrom(state.board, r, c));
    }
  }
  return steps;
}

export function legalDestinations(
  state: CheckersState,
  player: 1 | 2,
  from: Pos,
): Move[] {
  return legalMoves(state, player).filter(
    (m) => m.from[0] === from[0] && m.from[1] === from[1],
  );
}

function samePos(a: Pos, b: Pos): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function applyMove(
  state: CheckersState,
  player: 1 | 2,
  move: { from: Pos; to: Pos },
): CheckersState | null {
  const candidates = legalMoves(state, player);
  const found = candidates.find(
    (m) => samePos(m.from, move.from) && samePos(m.to, move.to),
  );
  if (!found) return null;

  const board = state.board.map((row) => [...row]) as Cell[][];
  const piece = board[move.from[0]][move.from[1]];
  if (!piece) return null;

  board[move.from[0]][move.from[1]] = null;
  for (const [cr, cc] of found.captures) {
    board[cr][cc] = null;
  }

  const becameKing =
    !piece.king &&
    ((piece.player === 1 && move.to[0] === C_SIZE - 1) ||
      (piece.player === 2 && move.to[0] === 0));

  board[move.to[0]][move.to[1]] = {
    player: piece.player,
    king: piece.king || becameKing,
  };

  // Traditional rule: crowning ends the turn even if more jumps are possible.
  let nextJumpChain: Pos | null = null;
  if (found.captures.length > 0 && !becameKing) {
    const more = findJumpsFrom(board, move.to[0], move.to[1]);
    if (more.length > 0) nextJumpChain = [move.to[0], move.to[1]];
  }

  const nextTurn: 1 | 2 = nextJumpChain ? player : player === 1 ? 2 : 1;

  const next: CheckersState = {
    board,
    turn: nextTurn,
    winner: null,
    jumpChain: nextJumpChain,
    lastMove: found,
  };

  // If the next player has no legal moves, the player who just moved wins.
  if (!nextJumpChain) {
    const otherMoves = legalMoves(next, nextTurn);
    if (otherMoves.length === 0) next.winner = player;
  }

  return next;
}
