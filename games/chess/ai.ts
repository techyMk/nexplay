/**
 * Chess AI — pure logic, no React.
 *
 * Five difficulty tiers:
 *   1 Easy        — random legal move.
 *   2 Medium      — greedy best capture (or random if none).
 *   3 Hard        — 2-ply minimax with material + PST.
 *   4 Master      — 3-ply minimax with alpha-beta pruning + PST.
 *   5 Grandmaster — 4-ply minimax with alpha-beta + PST + quiescence
 *                   search through capture sequences.
 *
 * Quiescence search prevents the horizon effect: without it, a fixed-
 * depth search could think it's winning a queen at depth N right
 * before its own queen gets recaptured at depth N+1.
 */

import { Chess, type Move, type PieceSymbol } from "chess.js";

export type Difficulty = 1 | 2 | 3 | 4 | 5;

/** Material values in centipawns. */
export const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

// Centre-favouring piece-square tables (simplified PeSTO/Sunfish).
// From white's perspective; for black we mirror vertically.
const PST_PAWN = [
  0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30,
  20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5,
  -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0,
  0,
];
const PST_KNIGHT = [
  -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30,
  0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20,
  20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20,
  -40, -50, -40, -30, -30, -30, -30, -40, -50,
];
const PST_BISHOP = [
  -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0,
  5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10,
  0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20,
  -10, -10, -10, -10, -10, -10, -20,
];
const PST_ROOK = [
  0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0,
  -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0,
  0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0,
];
const PST_QUEEN = [
  -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5,
  5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5,
  5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10,
  -10, -20,
];
const PST_KING = [
  -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40,
  -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40,
  -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20,
  -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20,
];

const PST: Record<PieceSymbol, number[]> = {
  p: PST_PAWN,
  n: PST_KNIGHT,
  b: PST_BISHOP,
  r: PST_ROOK,
  q: PST_QUEEN,
  k: PST_KING,
};

/** Evaluate the position from white's perspective.
 *  Positive = white advantage; negative = black. */
function evaluate(game: Chess): number {
  if (game.isCheckmate()) {
    return game.turn() === "w" ? -100000 : 100000;
  }
  if (game.isDraw() || game.isStalemate()) return 0;

  let score = 0;
  const board = game.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (!sq) continue;
      const v = PIECE_VALUES[sq.type];
      const idx = sq.color === "w" ? r * 8 + c : (7 - r) * 8 + c;
      const pst = PST[sq.type][idx];
      score += sq.color === "w" ? v + pst : -(v + pst);
    }
  }
  return score;
}

/** Order moves so captures and promotions come first; helps alpha-beta
 *  prune effectively. */
function orderMoves(moves: Move[]): Move[] {
  return moves.slice().sort((a, b) => {
    const aScore =
      (a.captured ? PIECE_VALUES[a.captured] : 0) +
      (a.promotion ? PIECE_VALUES[a.promotion] : 0);
    const bScore =
      (b.captured ? PIECE_VALUES[b.captured] : 0) +
      (b.promotion ? PIECE_VALUES[b.promotion] : 0);
    return bScore - aScore;
  });
}

/** Stand-pat quiescence: at a leaf, only continue through captures,
 *  and let the static eval cut early if the position is already quiet. */
function quiesce(
  game: Chess,
  alpha: number,
  beta: number,
  maximizing: boolean,
): number {
  if (game.isGameOver()) return evaluate(game);
  const standPat = evaluate(game);
  if (maximizing) {
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;
  } else {
    if (standPat <= alpha) return alpha;
    if (standPat < beta) beta = standPat;
  }
  const captures = (game.moves({ verbose: true }) as Move[]).filter(
    (m) => m.captured,
  );
  // MVV-LVA — biggest victims first, taken by smallest attackers.
  captures.sort((a, b) => {
    const av = PIECE_VALUES[a.captured!] - PIECE_VALUES[a.piece] * 0.1;
    const bv = PIECE_VALUES[b.captured!] - PIECE_VALUES[b.piece] * 0.1;
    return bv - av;
  });
  for (const m of captures) {
    game.move(m);
    const v = quiesce(game, alpha, beta, !maximizing);
    game.undo();
    if (maximizing) {
      if (v > alpha) alpha = v;
      if (alpha >= beta) return beta;
    } else {
      if (v < beta) beta = v;
      if (beta <= alpha) return alpha;
    }
  }
  return maximizing ? alpha : beta;
}

function minimax(
  game: Chess,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
  useQuiescence: boolean,
): number {
  if (game.isGameOver()) return evaluate(game);
  if (depth === 0) {
    return useQuiescence
      ? quiesce(game, alpha, beta, maximizing)
      : evaluate(game);
  }
  const moves = orderMoves(game.moves({ verbose: true }) as Move[]);
  if (maximizing) {
    let best = -Infinity;
    for (const m of moves) {
      game.move(m);
      const v = minimax(game, depth - 1, alpha, beta, false, useQuiescence);
      game.undo();
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of moves) {
      game.move(m);
      const v = minimax(game, depth - 1, alpha, beta, true, useQuiescence);
      game.undo();
      if (v < best) best = v;
      if (v < beta) beta = v;
      if (beta <= alpha) break;
    }
    return best;
  }
}

/** Pick a move for the side to play. Mutates `game` only briefly —
 *  every probe is undone before returning. */
export function pickAIMove(game: Chess, level: Difficulty): Move | null {
  const moves = game.moves({ verbose: true }) as Move[];
  if (moves.length === 0) return null;

  if (level === 1) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  if (level === 2) {
    let best: Move | null = null;
    let bestVal = -1;
    for (const m of moves) {
      const v = m.captured ? PIECE_VALUES[m.captured] : 0;
      if (v > bestVal) {
        bestVal = v;
        best = m;
      }
    }
    if (best && bestVal > 0) return best;
    return moves[Math.floor(Math.random() * moves.length)];
  }

  const depth = level === 3 ? 2 : level === 4 ? 3 : 4;
  const useQuiescence = level === 5;
  const isWhite = game.turn() === "w";
  // Within an equal-score tie, pick at random to avoid robotic play.
  let bestMoves: Move[] = [];
  let bestScore = isWhite ? -Infinity : Infinity;
  for (const m of orderMoves(moves)) {
    game.move(m);
    const score = minimax(
      game,
      depth - 1,
      -Infinity,
      Infinity,
      !isWhite,
      useQuiescence,
    );
    game.undo();
    if (isWhite) {
      if (score > bestScore) {
        bestScore = score;
        bestMoves = [m];
      } else if (score === bestScore) {
        bestMoves.push(m);
      }
    } else {
      if (score < bestScore) {
        bestScore = score;
        bestMoves = [m];
      } else if (score === bestScore) {
        bestMoves.push(m);
      }
    }
  }
  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}
