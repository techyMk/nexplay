"use client";

/**
 * Chess — local + vs-AI.
 *
 * chess.js handles all the rule edge cases (legal moves, check /
 * checkmate, en passant, castling, pawn promotion, threefold
 * repetition, insufficient material, 50-move rule, draw detection,
 * FEN / PGN). We own everything on top: UI, AI, animation, sound.
 *
 * The same Chess instance lives in a ref across renders — needed
 * because threefold-repetition detection requires real move history,
 * which is lost if we clone via `new Chess(fen)` between turns. A
 * version counter forces re-renders after each mutation.
 *
 * AI levels:
 *   1 Pawn      — random legal move (great for beginners).
 *   2 Knight    — greedy: prefer the best capture, otherwise random.
 *   3 Bishop    — 2-ply minimax with material evaluation.
 *   4 Queen     — 3-ply minimax with alpha-beta pruning + small
 *                 positional bonus from piece-square tables.
 *
 * Multiplayer (online) is a follow-up — this file is single-device
 * only for now.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Chess, type Move, type PieceSymbol, type Square } from "chess.js";
import { GameOverlay } from "@/components/games/GameOverlay";
import { SoundToggle } from "@/components/SoundToggle";
import { Sfx } from "@/lib/sound";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type Color = "w" | "b";
type Difficulty = 1 | 2 | 3 | 4;

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

/** Material values in centipawns. Used for greedy AI ordering and as
 *  the material term of the minimax evaluation. */
const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

/** Unicode chess glyphs — render well in modern fonts on every
 *  platform we ship to, and avoid bundling 12 SVGs. We tint by
 *  CSS color so the same glyph reads as white or black on the board. */
const PIECE_GLYPH: Record<PieceSymbol, string> = {
  k: "♚",
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
  p: "♟",
};

const DIFFICULTY_NAMES: Record<Difficulty, string> = {
  1: "Pawn",
  2: "Knight",
  3: "Bishop",
  4: "Queen",
};

const DIFFICULTY_HINTS: Record<Difficulty, string> = {
  1: "Random legal moves — great for learning.",
  2: "Greedy: takes the best capture available.",
  3: "Looks 2 plies ahead with material.",
  4: "Looks 3 plies ahead with positional sense.",
};

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

/** Centre-favouring piece-square tables for the level-4 evaluator. The
 *  numbers are roughly the simplified PeSTO/Sunfish tables — small
 *  positional nudges, not enough to override material. We use them
 *  from white's perspective; for black, we mirror vertically. */
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
    // The side whose turn it is has been mated.
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
      // PST index: for white, use r * 8 + c; for black, mirror rank.
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

function minimax(
  game: Chess,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
): number {
  if (depth === 0 || game.isGameOver()) {
    return evaluate(game);
  }
  const moves = orderMoves(game.moves({ verbose: true }) as Move[]);
  if (maximizing) {
    let best = -Infinity;
    for (const m of moves) {
      game.move(m);
      const v = minimax(game, depth - 1, alpha, beta, false);
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
      const v = minimax(game, depth - 1, alpha, beta, true);
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
function pickAIMove(game: Chess, level: Difficulty): Move | null {
  const moves = game.moves({ verbose: true }) as Move[];
  if (moves.length === 0) return null;

  if (level === 1) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  if (level === 2) {
    // Greedy: best capture, or random if no captures.
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

  // Minimax with alpha-beta. Depth depends on level.
  const depth = level === 3 ? 2 : 3;
  const isWhite = game.turn() === "w";
  // Within an equal-score tie, pick at random to avoid robotic play.
  let bestMoves: Move[] = [];
  let bestScore = isWhite ? -Infinity : Infinity;
  const ordered = orderMoves(moves);
  for (const m of ordered) {
    game.move(m);
    const score = minimax(
      game,
      depth - 1,
      -Infinity,
      Infinity,
      !isWhite,
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Group captured pieces and convert into a sorted glyph list for the
 *  HUD. Pieces are grouped low-to-high value (left = pawns, right = queens). */
function capturedByColor(history: Move[], byColor: Color): PieceSymbol[] {
  // A move captures a piece of the opposite color. `byColor` here is
  // the side that *did* the capturing, so we want moves played by
  // that color where m.captured is set.
  const captured: PieceSymbol[] = [];
  for (const m of history) {
    if (m.color === byColor && m.captured) captured.push(m.captured);
  }
  return captured.sort((a, b) => PIECE_VALUES[a] - PIECE_VALUES[b]);
}

/** Material balance from white's perspective (positive = white ahead). */
function materialBalance(captured: { w: PieceSymbol[]; b: PieceSymbol[] }) {
  const sum = (a: PieceSymbol[]) =>
    a.reduce((s, p) => s + PIECE_VALUES[p], 0);
  return sum(captured.w) - sum(captured.b);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type OverReason =
  | "checkmate"
  | "stalemate"
  | "draw-fifty"
  | "draw-repetition"
  | "draw-material"
  | "draw"
  | "resign";

type OverState = { winner: Color | "draw"; reason: OverReason } | null;

export default function ChessGame() {
  // Single chess.js instance preserves move history for repetition /
  // 50-move detection. We force re-renders with a tick counter.
  const gameRef = useRef<Chess>(new Chess());
  const [, forceTick] = useState(0);
  const rerender = useCallback(
    () => forceTick((t) => t + 1),
    [],
  );

  const [playerColor, setPlayerColor] = useState<Color>("w");
  const [difficulty, setDifficulty] = useState<Difficulty>(2);
  const [flipped, setFlipped] = useState(false);
  const [selected, setSelected] = useState<Square | null>(null);
  /** Verbose legal moves from `selected`; used to render targets and
   *  resolve a click on a destination square. */
  const [legalFromSel, setLegalFromSel] = useState<Move[]>([]);
  const [aiThinking, setAiThinking] = useState(false);
  const [over, setOver] = useState<OverState>(null);
  /** While a promotion is pending we hold the from/to so the player
   *  can click a piece-glyph button to pick what to promote to. */
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: Square;
    to: Square;
  } | null>(null);

  const game = gameRef.current;
  const board = game.board();
  const turn = game.turn();
  const inCheck = game.isCheck();
  const history = game.history({ verbose: true }) as Move[];
  const lastMove = history.length > 0 ? history[history.length - 1] : null;
  // The board view defaults to "white at the bottom"; flipping (or
  // playing black) inverts the rank/file rendering.
  const showFromBlackSide = playerColor === "b" ? !flipped : flipped;

  // ----- AI move dispatch -----
  useEffect(() => {
    if (over) return;
    if (turn === playerColor) return;
    // Defer so the player's move animation has rendered first, and
    // levels 3-4 don't lock up the main thread.
    let cancelled = false;
    setAiThinking(true);
    const delayMs = difficulty <= 2 ? 240 : 380;
    const handle = setTimeout(() => {
      if (cancelled || over) {
        setAiThinking(false);
        return;
      }
      const move = pickAIMove(gameRef.current, difficulty);
      if (move) {
        gameRef.current.move({
          from: move.from,
          to: move.to,
          promotion: move.promotion,
        });
        playMoveSound(move);
        checkForGameOver(gameRef.current, setOver);
        rerender();
      }
      setAiThinking(false);
    }, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [turn, playerColor, difficulty, over, rerender, history.length]);

  // ----- Game-over check on each turn change -----
  // (We also call this immediately after a player move so the AI
  // dispatch above doesn't kick in on a finished position.)
  useEffect(() => {
    if (over) return;
    checkForGameOver(gameRef.current, setOver);
  }, [history.length, over]);

  // ----- New game / reset -----
  const newGame = useCallback(
    (opts?: { color?: Color; difficulty?: Difficulty }) => {
      gameRef.current = new Chess();
      setSelected(null);
      setLegalFromSel([]);
      setOver(null);
      setPendingPromotion(null);
      if (opts?.color) setPlayerColor(opts.color);
      if (opts?.difficulty) setDifficulty(opts.difficulty);
      rerender();
    },
    [rerender],
  );

  const undoLast = useCallback(() => {
    if (over || aiThinking) return;
    // Undo both the AI's move and the player's so the user gets back
    // a full turn. If it's currently the AI's turn (we just moved),
    // a single undo would only revert the player. Two undos.
    const g = gameRef.current;
    if (g.history().length === 0) return;
    g.undo();
    // After the player's move, the AI moved automatically — so undo
    // again to give the player their full turn back. If history is
    // exhausted (first move), don't bother.
    if (g.history().length > 0 && g.turn() !== playerColor) {
      g.undo();
    }
    setSelected(null);
    setLegalFromSel([]);
    setOver(null);
    rerender();
    Sfx.click();
  }, [over, aiThinking, playerColor, rerender]);

  // ----- Click handling -----
  function onSquareClick(sq: Square) {
    if (over || aiThinking) return;
    if (turn !== playerColor) return; // ignore clicks during AI think
    if (pendingPromotion) return; // promotion menu has its own buttons

    const g = gameRef.current;

    // Clicking a target of the current selection → make the move.
    const target = legalFromSel.find((m) => m.to === sq);
    if (selected && target) {
      // Promotion: stash the from/to and let the player pick.
      if (target.promotion) {
        setPendingPromotion({ from: selected, to: sq });
        return;
      }
      const result = g.move({ from: selected, to: sq });
      if (result) {
        playMoveSound(result);
        setSelected(null);
        setLegalFromSel([]);
        checkForGameOver(g, setOver);
        rerender();
      }
      return;
    }

    // Otherwise: try to select a piece of the player's colour on `sq`.
    const piece = g.get(sq);
    if (piece && piece.color === playerColor) {
      setSelected(sq);
      setLegalFromSel(g.moves({ square: sq, verbose: true }) as Move[]);
      Sfx.click();
      return;
    }

    // Clicked elsewhere → clear selection.
    setSelected(null);
    setLegalFromSel([]);
  }

  function resolvePromotion(piece: PieceSymbol) {
    if (!pendingPromotion) return;
    const g = gameRef.current;
    const result = g.move({
      from: pendingPromotion.from,
      to: pendingPromotion.to,
      promotion: piece,
    });
    if (result) {
      playMoveSound(result);
      setSelected(null);
      setLegalFromSel([]);
      checkForGameOver(g, setOver);
      rerender();
    }
    setPendingPromotion(null);
  }

  function resign() {
    if (over) return;
    setOver({
      winner: playerColor === "w" ? "b" : "w",
      reason: "resign",
    });
    Sfx.gameOver();
  }

  // ----- Derived UI data -----
  const captured = {
    w: capturedByColor(history, "w"), // pieces white captured (i.e., black pieces)
    b: capturedByColor(history, "b"), // pieces black captured (i.e., white pieces)
  };
  const balance = materialBalance(captured);
  // Pair up the move list into [white, black] tuples for display.
  const movePairs: { num: number; white: Move; black?: Move }[] = [];
  for (let i = 0; i < history.length; i += 2) {
    movePairs.push({
      num: i / 2 + 1,
      white: history[i],
      black: history[i + 1],
    });
  }

  // King in check → red-tint the king's square. We compute the actual
  // square from the FEN's side-to-move.
  let checkedKingSq: string | null = null;
  if (inCheck && !over) {
    const colorInCheck = turn;
    outer: for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = board[r][c];
        if (sq && sq.type === "k" && sq.color === colorInCheck) {
          checkedKingSq = FILES[c] + (8 - r);
          break outer;
        }
      }
    }
  }

  // ----- Render -----
  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-[#1a1410] to-[#0b0d12] p-2 sm:p-3 select-none">
      {/* Top HUD */}
      <div className="shrink-0 flex items-center justify-center gap-2 mb-2 text-white text-xs sm:text-sm flex-wrap">
        <DifficultyPicker
          value={difficulty}
          onChange={(d) => setDifficulty(d)}
        />
        <ColorPicker
          value={playerColor}
          onChange={(c) => newGame({ color: c })}
        />
        <button
          onClick={() => setFlipped((f) => !f)}
          className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-bold transition-colors inline-flex items-center gap-1.5"
          title="Flip the board"
        >
          ⇅ Flip
        </button>
        <button
          onClick={undoLast}
          disabled={over !== null || aiThinking || history.length === 0}
          className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/15 disabled:opacity-40 disabled:hover:bg-white/10 border border-white/15 text-white text-xs font-bold transition-colors"
          title="Undo your last move (and the AI's reply)"
        >
          ↶ Undo
        </button>
        <button
          onClick={() => newGame()}
          className="px-2.5 py-1 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 text-xs font-bold transition-colors"
        >
          ↻ New
        </button>
        <button
          onClick={resign}
          disabled={over !== null || history.length === 0}
          className="px-2.5 py-1 rounded-md bg-rose-500/15 hover:bg-rose-500/25 disabled:opacity-40 disabled:hover:bg-rose-500/15 border border-rose-400/30 text-rose-200 text-xs font-bold transition-colors"
        >
          🏳 Resign
        </button>
        <SoundToggle />
      </div>

      {/* Main two-pane: board + side panel */}
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[1fr_320px] gap-3">
        {/* Board column */}
        <div className="relative flex items-center justify-center min-h-0">
          <div className="relative h-full max-h-full aspect-square">
            <Board
              board={board}
              flipped={showFromBlackSide}
              selected={selected}
              legalFromSel={legalFromSel}
              lastMove={lastMove}
              checkedKingSq={checkedKingSq}
              onSquareClick={onSquareClick}
            />
            {aiThinking && (
              <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-md bg-black/65 text-white text-xs font-bold">
                AI thinking…
              </div>
            )}
            {pendingPromotion && (
              <PromotionMenu
                color={playerColor}
                onPick={resolvePromotion}
                onCancel={() => setPendingPromotion(null)}
              />
            )}
          </div>
        </div>

        {/* Side panel: captured + history */}
        <div className="flex flex-col gap-2 min-h-0">
          <CapturedRow
            label={playerColor === "w" ? "You captured" : "AI captured"}
            pieces={captured[playerColor]}
            balance={
              playerColor === "w" ? balance : -balance
            }
          />
          <div className="flex-1 min-h-0 rounded-xl bg-black/30 border border-white/10 overflow-hidden flex flex-col">
            <div className="shrink-0 px-3 py-1.5 text-[10px] uppercase tracking-wider text-white/60 font-black border-b border-white/10">
              Move history
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar px-2 py-1 text-xs text-white/80 font-mono">
              {movePairs.length === 0 && (
                <div className="text-white/40 italic px-1 py-2">
                  No moves yet.
                </div>
              )}
              {movePairs.map((p) => (
                <div
                  key={p.num}
                  className="grid grid-cols-[28px_1fr_1fr] gap-1 py-0.5 hover:bg-white/5 rounded px-1"
                >
                  <span className="text-white/40 text-right tabular-nums">
                    {p.num}.
                  </span>
                  <span>{p.white.san}</span>
                  <span>{p.black?.san ?? ""}</span>
                </div>
              ))}
            </div>
          </div>
          <CapturedRow
            label={playerColor === "w" ? "AI captured" : "You captured"}
            pieces={captured[playerColor === "w" ? "b" : "w"]}
            balance={
              playerColor === "w" ? -balance : balance
            }
          />
        </div>
      </div>

      {/* Game-over overlay */}
      {over && (
        <GameOverlay
          icon={
            over.winner === playerColor
              ? "🏆"
              : over.winner === "draw"
                ? "🤝"
                : "💀"
          }
          title={
            over.reason === "resign"
              ? "Resigned"
              : over.winner === "draw"
                ? "Draw"
                : "Checkmate"
          }
          subtitle={overSubtitle(over, playerColor, difficulty)}
          primary={{ label: "↻ New game", onClick: () => newGame() }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Board({
  board,
  flipped,
  selected,
  legalFromSel,
  lastMove,
  checkedKingSq,
  onSquareClick,
}: {
  board: ReturnType<Chess["board"]>;
  flipped: boolean;
  selected: Square | null;
  legalFromSel: Move[];
  lastMove: Move | null;
  checkedKingSq: string | null;
  onSquareClick: (sq: Square) => void;
}) {
  const rows = flipped ? [...board].reverse() : board;

  return (
    <div className="w-full h-full grid grid-rows-8 grid-cols-8 rounded-lg overflow-hidden ring-2 ring-amber-900/40 shadow-2xl">
      {rows.map((row, rIdx) => {
        const rowToRender = flipped ? [...row].reverse() : row;
        // Recover the original (unflipped) row index for square names.
        const realR = flipped ? 7 - rIdx : rIdx;
        return rowToRender.map((sq, cIdx) => {
          const realC = flipped ? 7 - cIdx : cIdx;
          const square = (FILES[realC] + (8 - realR)) as Square;
          const isLight = (realR + realC) % 2 === 0;
          const isSelected = selected === square;
          const target = legalFromSel.find((m) => m.to === square);
          const isLast =
            lastMove &&
            (lastMove.from === square || lastMove.to === square);
          const isChecked = checkedKingSq === square;

          // Base palette — warm amber / dark walnut.
          let bg = isLight
            ? "bg-amber-100"
            : "bg-amber-800";
          if (isLast) {
            bg = isLight ? "bg-yellow-300" : "bg-yellow-600";
          }
          if (isSelected) {
            bg = "bg-emerald-400";
          }
          if (isChecked) {
            bg = "bg-rose-500";
          }

          return (
            <button
              key={square}
              onClick={() => onSquareClick(square)}
              className={`relative flex items-center justify-center transition-colors ${bg}`}
              aria-label={square}
            >
              {/* File / rank coordinate labels in the bottom-left
                  and top-right corners. Only render on edge squares
                  so the board doesn't look busy. */}
              {cIdx === 0 && (
                <span
                  className={`absolute top-0.5 left-1 text-[9px] font-bold ${
                    isLight ? "text-amber-900/60" : "text-amber-100/60"
                  }`}
                >
                  {8 - realR}
                </span>
              )}
              {rIdx === 7 && (
                <span
                  className={`absolute bottom-0.5 right-1 text-[9px] font-bold ${
                    isLight ? "text-amber-900/60" : "text-amber-100/60"
                  }`}
                >
                  {FILES[realC]}
                </span>
              )}
              {/* Legal-move marker — small filled circle in empty
                  squares, hollow ring around capturable pieces. */}
              {target && !target.captured && (
                <span className="absolute w-1/3 h-1/3 rounded-full bg-emerald-700/55 pointer-events-none" />
              )}
              {target && target.captured && (
                <span
                  className="absolute inset-1 rounded-full pointer-events-none"
                  style={{
                    boxShadow: "inset 0 0 0 4px rgba(16,185,129,0.6)",
                  }}
                />
              )}
              {/* Piece glyph */}
              {sq && (
                <span
                  className={`relative z-10 select-none ${
                    sq.color === "w"
                      ? "text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.6)]"
                      : "text-stone-900 drop-shadow-[0_1px_0_rgba(255,255,255,0.45)]"
                  }`}
                  style={{
                    fontSize: "min(7vw, 56px)",
                    lineHeight: 1,
                  }}
                >
                  {PIECE_GLYPH[sq.type]}
                </span>
              )}
            </button>
          );
        });
      })}
    </div>
  );
}

function PromotionMenu({
  color,
  onPick,
  onCancel,
}: {
  color: Color;
  onPick: (p: PieceSymbol) => void;
  onCancel: () => void;
}) {
  const pieces: PieceSymbol[] = ["q", "r", "b", "n"];
  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/65 backdrop-blur-sm rounded-lg"
      onClick={onCancel}
    >
      <div
        className="rounded-xl bg-[var(--surface)] border border-white/15 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-xs uppercase tracking-wider opacity-70 font-bold mb-2 text-center">
          Promote pawn to
        </div>
        <div className="flex gap-2">
          {pieces.map((p) => (
            <button
              key={p}
              onClick={() => onPick(p)}
              className="w-14 h-14 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-4xl flex items-center justify-center transition-colors"
              style={{
                color: color === "w" ? "white" : "#1c1917",
                textShadow:
                  color === "w"
                    ? "0 2px 2px rgba(0,0,0,0.6)"
                    : "0 1px 0 rgba(255,255,255,0.5)",
              }}
              title={p.toUpperCase()}
            >
              {PIECE_GLYPH[p]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DifficultyPicker({
  value,
  onChange,
}: {
  value: Difficulty;
  onChange: (d: Difficulty) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
      >
        <span className="opacity-60">AI</span>
        <b>{DIFFICULTY_NAMES[value]}</b>
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 011.08 1.04l-4.24 4.38a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute left-0 mt-1 z-30 min-w-[210px] rounded-xl bg-[#11141d] border border-white/15 shadow-xl py-1 overflow-hidden"
        >
          {([1, 2, 3, 4] as Difficulty[]).map((d) => (
            <li key={d}>
              <button
                type="button"
                onClick={() => {
                  onChange(d);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs font-bold transition-colors ${
                  d === value
                    ? "bg-emerald-500/25 text-white"
                    : "text-white/85 hover:bg-white/10"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>
                    {d}. {DIFFICULTY_NAMES[d]}
                  </span>
                </div>
                <div className="text-[10px] font-normal opacity-60 mt-0.5">
                  {DIFFICULTY_HINTS[d]}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ColorPicker({
  value,
  onChange,
}: {
  value: Color;
  onChange: (c: Color) => void;
}) {
  return (
    <div className="inline-flex rounded-md bg-white/10 border border-white/15 p-0.5">
      <button
        onClick={() => onChange("w")}
        className={`px-2.5 py-1 rounded-sm text-xs font-bold transition-colors ${
          value === "w"
            ? "bg-white text-black"
            : "text-white/70 hover:text-white"
        }`}
        title="Play as white"
      >
        ♔ White
      </button>
      <button
        onClick={() => onChange("b")}
        className={`px-2.5 py-1 rounded-sm text-xs font-bold transition-colors ${
          value === "b"
            ? "bg-stone-900 text-white"
            : "text-white/70 hover:text-white"
        }`}
        title="Play as black"
      >
        ♚ Black
      </button>
    </div>
  );
}

function CapturedRow({
  label,
  pieces,
  balance,
}: {
  label: string;
  pieces: PieceSymbol[];
  /** Material balance from this side's perspective (positive = ahead). */
  balance: number;
}) {
  return (
    <div className="shrink-0 rounded-xl bg-black/30 border border-white/10 px-3 py-2">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-white/55 font-black mb-1">
        <span>{label}</span>
        {balance > 0 && (
          <span className="text-emerald-300">+{balance / 100}</span>
        )}
      </div>
      {pieces.length === 0 ? (
        <div className="text-white/30 text-xs italic">Nothing yet.</div>
      ) : (
        <div className="text-2xl leading-none flex flex-wrap gap-x-0.5">
          {pieces.map((p, i) => (
            <span key={i} className="text-white/90">
              {PIECE_GLYPH[p]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Game-over helpers
// ---------------------------------------------------------------------------

function checkForGameOver(
  game: Chess,
  setOver: (o: OverState) => void,
) {
  if (!game.isGameOver()) return;
  if (game.isCheckmate()) {
    // Side to move has been mated.
    const winner: Color = game.turn() === "w" ? "b" : "w";
    setOver({ winner, reason: "checkmate" });
    Sfx.win();
    return;
  }
  if (game.isStalemate()) {
    setOver({ winner: "draw", reason: "stalemate" });
    Sfx.gameOver();
    return;
  }
  if (game.isThreefoldRepetition()) {
    setOver({ winner: "draw", reason: "draw-repetition" });
    Sfx.gameOver();
    return;
  }
  if (game.isInsufficientMaterial()) {
    setOver({ winner: "draw", reason: "draw-material" });
    Sfx.gameOver();
    return;
  }
  if (game.isDraw()) {
    setOver({ winner: "draw", reason: "draw-fifty" });
    Sfx.gameOver();
    return;
  }
}

function overSubtitle(
  over: NonNullable<OverState>,
  playerColor: Color,
  difficulty: Difficulty,
): React.ReactNode {
  if (over.reason === "resign") {
    return (
      <>
        You resigned against <b>AI · {DIFFICULTY_NAMES[difficulty]}</b>.
      </>
    );
  }
  if (over.winner === "draw") {
    const reasonText =
      over.reason === "stalemate"
        ? "Stalemate — the side to move has no legal moves."
        : over.reason === "draw-repetition"
          ? "Threefold repetition."
          : over.reason === "draw-material"
            ? "Insufficient material to checkmate."
            : "Draw by the 50-move rule.";
    return <>{reasonText}</>;
  }
  if (over.winner === playerColor) {
    return (
      <>
        Checkmate — you beat <b>AI · {DIFFICULTY_NAMES[difficulty]}</b>.
      </>
    );
  }
  return (
    <>
      Checkmate — <b>AI · {DIFFICULTY_NAMES[difficulty]}</b> won.
    </>
  );
}

/** Pick a sound effect for a move based on its flags. Castling
 *  ('k'/'q') gets a distinct cue; otherwise any capture (incl. en
 *  passant) plays the heavier thud; everything else clicks. */
function playMoveSound(m: Move) {
  if (m.flags.includes("k") || m.flags.includes("q")) {
    Sfx.pickup();
  } else if (m.captured) {
    Sfx.thud();
  } else {
    Sfx.click();
  }
}

