import { describe, it, expect } from "vitest";
import {
  INITIAL_CHECKERS_STATE,
  applyMove,
  legalMoves,
  legalDestinations,
} from "@/lib/checkers";

describe("checkers", () => {
  it("opens with 12 pieces per side on dark squares", () => {
    const b = INITIAL_CHECKERS_STATE.board;
    let p1 = 0;
    let p2 = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const cell = b[r][c];
        if (cell?.player === 1) p1++;
        if (cell?.player === 2) p2++;
        if (cell && (r + c) % 2 === 0) {
          throw new Error(`piece on light square (${r},${c})`);
        }
      }
    }
    expect(p1).toBe(12);
    expect(p2).toBe(12);
  });

  it("player 1 starts and has 7 legal step openings", () => {
    const moves = legalMoves(INITIAL_CHECKERS_STATE, 1);
    expect(INITIAL_CHECKERS_STATE.turn).toBe(1);
    expect(moves.every((m) => m.captures.length === 0)).toBe(true);
    expect(moves.length).toBe(7);
  });

  it("rejects moves from the wrong player", () => {
    expect(legalMoves(INITIAL_CHECKERS_STATE, 2)).toEqual([]);
  });

  it("applyMove returns null for an illegal move", () => {
    const next = applyMove(INITIAL_CHECKERS_STATE, 1, {
      from: [0, 0],
      to: [4, 4],
    });
    expect(next).toBeNull();
  });

  it("applies a legal first move and flips the turn", () => {
    const moves = legalMoves(INITIAL_CHECKERS_STATE, 1);
    const next = applyMove(INITIAL_CHECKERS_STATE, 1, {
      from: moves[0].from,
      to: moves[0].to,
    });
    expect(next).not.toBeNull();
    expect(next!.turn).toBe(2);
    expect(next!.winner).toBeNull();
  });

  it("forces a capture when one is available", () => {
    // Build a board where player 1 has a forced jump.
    const b: import("@/lib/checkers").Cell[][] = Array.from({ length: 8 }, () =>
      Array<import("@/lib/checkers").Cell>(8).fill(null),
    );
    b[2][2] = { player: 1, king: false };
    b[3][3] = { player: 2, king: false };
    // and another non-jump option that should be filtered out
    b[2][6] = { player: 1, king: false };
    const state = {
      board: b,
      turn: 1 as const,
      winner: null,
      jumpChain: null,
      lastMove: null,
    };
    const moves = legalMoves(state, 1);
    expect(moves).toHaveLength(1);
    expect(moves[0].captures).toEqual([[3, 3]]);
    expect(moves[0].to).toEqual([4, 4]);
  });

  it("removes the captured piece after a jump", () => {
    const b: import("@/lib/checkers").Cell[][] = Array.from({ length: 8 }, () =>
      Array<import("@/lib/checkers").Cell>(8).fill(null),
    );
    b[2][2] = { player: 1, king: false };
    b[3][3] = { player: 2, king: false };
    const state = {
      board: b,
      turn: 1 as const,
      winner: null,
      jumpChain: null,
      lastMove: null,
    };
    const next = applyMove(state, 1, { from: [2, 2], to: [4, 4] });
    expect(next).not.toBeNull();
    expect(next!.board[3][3]).toBeNull();
    expect(next!.board[2][2]).toBeNull();
    expect(next!.board[4][4]?.player).toBe(1);
  });

  it("legalDestinations narrows to one source square", () => {
    const moves = legalDestinations(INITIAL_CHECKERS_STATE, 1, [2, 1]);
    // From (2,1) the man at row 2 can go to (3,0) or (3,2).
    expect(moves.length).toBe(2);
    expect(moves.every((m) => m.from[0] === 2 && m.from[1] === 1)).toBe(true);
  });
});
