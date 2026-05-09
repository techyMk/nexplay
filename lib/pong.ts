// Pong multiplayer.
// rooms.state stores match-level info (scores, winner, target).
// Per-frame ball + paddle state lives in a Supabase realtime broadcast
// channel — host is authoritative, guest sends only paddle position.

export const FIELD_W = 1; // normalized
export const FIELD_H = 0.6; // 5:3 aspect
export const PADDLE_W = 0.018;
export const PADDLE_H = 0.18;
export const PADDLE_X = 0.04; // distance from each side wall
export const BALL_R = 0.018;
export const BASE_SPEED = 0.55; // normalized units per second
export const SPEED_MULT = 1.04;
export const MAX_SPEED = 1.5;
export const TARGET_SCORE = 5;
export const TICK_HZ = 30;
export const PADDLE_SEND_HZ = 30;

export type PongState = {
  scoreL: number;
  scoreR: number;
  winner: 1 | 2 | null;
  target: number;
};

export const INITIAL_PONG_STATE: PongState = {
  scoreL: 0,
  scoreR: 0,
  winner: null,
  target: TARGET_SCORE,
};

export type Snapshot = {
  bx: number; // ball x in [0..1]
  by: number; // ball y in [0..FIELD_H]
  vx: number;
  vy: number;
  pl: number; // left paddle center y
  pr: number; // right paddle center y
};

export function freshSnapshot(serveTo: 1 | 2): Snapshot {
  const angle = (Math.random() - 0.5) * 0.7; // -0.35..0.35 rad
  const dir = serveTo === 1 ? -1 : 1;
  return {
    bx: 0.5,
    by: FIELD_H / 2,
    vx: dir * BASE_SPEED * Math.cos(angle),
    vy: BASE_SPEED * Math.sin(angle),
    pl: FIELD_H / 2,
    pr: FIELD_H / 2,
  };
}

export function clampPaddle(y: number): number {
  const half = PADDLE_H / 2;
  if (y < half) return half;
  if (y > FIELD_H - half) return FIELD_H - half;
  return y;
}

function clampSpeed(vx: number, vy: number): [number, number] {
  const sp = Math.hypot(vx, vy);
  if (sp <= MAX_SPEED) return [vx, vy];
  return [(vx / sp) * MAX_SPEED, (vy / sp) * MAX_SPEED];
}

/** One physics tick. Returns next snapshot and which side scored, if any. */
export function step(s: Snapshot, dt: number): { next: Snapshot; pointFor: 1 | 2 | null } {
  let { bx, by, vx, vy } = s;
  bx += vx * dt;
  by += vy * dt;

  // top / bottom walls
  if (by < BALL_R && vy < 0) {
    by = BALL_R;
    vy = -vy;
  }
  if (by > FIELD_H - BALL_R && vy > 0) {
    by = FIELD_H - BALL_R;
    vy = -vy;
  }

  // left paddle (player 1)
  const lEdge = PADDLE_X + PADDLE_W;
  if (bx - BALL_R < lEdge && vx < 0) {
    const overlap = Math.abs(by - s.pl);
    if (overlap < PADDLE_H / 2 + BALL_R) {
      bx = lEdge + BALL_R;
      vx = -vx * SPEED_MULT;
      vy += (by - s.pl) * 1.6; // english based on hit position
      [vx, vy] = clampSpeed(vx, vy);
    }
  }

  // right paddle (player 2)
  const rEdge = 1 - PADDLE_X - PADDLE_W;
  if (bx + BALL_R > rEdge && vx > 0) {
    const overlap = Math.abs(by - s.pr);
    if (overlap < PADDLE_H / 2 + BALL_R) {
      bx = rEdge - BALL_R;
      vx = -vx * SPEED_MULT;
      vy += (by - s.pr) * 1.6;
      [vx, vy] = clampSpeed(vx, vy);
    }
  }

  if (bx < -BALL_R) {
    return { next: { ...s, bx, by, vx, vy }, pointFor: 2 };
  }
  if (bx > 1 + BALL_R) {
    return { next: { ...s, bx, by, vx, vy }, pointFor: 1 };
  }

  return { next: { ...s, bx, by, vx, vy }, pointFor: null };
}
