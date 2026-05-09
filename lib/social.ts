/**
 * Helpers for the friendships canonical-ordering trick. user_a is
 * always lexicographically smaller than user_b, so the (user_a, user_b)
 * primary key uniquely identifies a pair regardless of who initiated.
 */

export function pairOrder(idA: string, idB: string): { a: string; b: string } {
  return idA < idB ? { a: idA, b: idB } : { a: idB, b: idA };
}

/** From the perspective of `me`, the other party in a friendship row. */
export function otherParty(
  row: { user_a: string; user_b: string },
  me: string,
): string {
  return row.user_a === me ? row.user_b : row.user_a;
}
