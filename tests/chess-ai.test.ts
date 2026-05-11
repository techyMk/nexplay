import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { pickAIMove, PIECE_VALUES } from "@/games/chess/ai";

describe("chess AI", () => {
  it("level 1 returns a legal move from the opening position", () => {
    const game = new Chess();
    const m = pickAIMove(game, 1);
    expect(m).not.toBeNull();
    expect(game.moves().includes(m!.san)).toBe(true);
  });

  it("returns null when there are no legal moves", () => {
    // Fool's mate position — black to move but already checkmated... actually
    // construct a fresh stalemate-like position. Easiest: load a finished game.
    const game = new Chess("8/8/8/8/8/4k3/8/4K3 w - - 0 1");
    // Just verify pickAIMove doesn't crash when game is essentially over;
    // it returns a move because moves exist in this position. Use a real
    // mate-in-zero position instead.
    const mated = new Chess(
      "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3",
    );
    // White is in checkmate (Fool's mate).
    expect(mated.isCheckmate()).toBe(true);
    expect(pickAIMove(mated, 3)).toBeNull();
    // Avoid unused warning.
    void game;
  });

  it("level 2 (greedy) prefers a free capture over a random move", () => {
    // White to move with a free queen capture: black queen on d4, white pawn on c3.
    // Compose a board where white can capture the queen with the pawn.
    const game = new Chess("4k3/8/8/8/3q4/2P5/8/4K3 w - - 0 1");
    const m = pickAIMove(game, 2);
    expect(m).not.toBeNull();
    expect(m!.captured).toBe("q");
  });

  it("level 3 (minimax) finds mate-in-one", () => {
    // White to move, mate-in-one: Qh5#? Use a known mate-in-one position.
    // After 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6?? — now Qxf7# is mate.
    const game = new Chess(
      "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4",
    );
    // Actually verify with a simpler position. Mate-in-one for white:
    // K on e1, Q on h5, vs black K alone, with white to mate.
    const mateInOne = new Chess(
      "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
    );
    // White: Re8# (Re1-e8 is mate). Verify pickAIMove finds a mating move.
    const m = pickAIMove(mateInOne, 3);
    expect(m).not.toBeNull();
    mateInOne.move(m!);
    expect(mateInOne.isCheckmate()).toBe(true);
  });

  it("piece values follow conventional centipawn scale", () => {
    expect(PIECE_VALUES.p).toBe(100);
    expect(PIECE_VALUES.n).toBeGreaterThan(PIECE_VALUES.p);
    expect(PIECE_VALUES.q).toBeGreaterThan(PIECE_VALUES.r);
    expect(PIECE_VALUES.k).toBeGreaterThan(PIECE_VALUES.q * 10);
  });

  it("never mutates the game state when called", () => {
    const game = new Chess();
    const fenBefore = game.fen();
    pickAIMove(game, 4);
    expect(game.fen()).toBe(fenBefore);
  });
});
