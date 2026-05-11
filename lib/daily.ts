// Daily challenges. Definitions live here so the database only has to
// track which user completed which challenge on which day.
//
// The set of three daily challenges is picked deterministically from
// the date key (YYYY-MM-DD UTC), so every player sees the same three
// challenges on the same day.

import { getGame } from "./catalog";

export type DailyChallenge = {
  id: string;
  gameSlug: string;
  /** Short hook shown in cards */
  title: string;
  /** One-line description, used as the goal sentence */
  description: string;
  /** Score threshold — completed when player's submitted score >= threshold */
  threshold: number;
};

const POOL: DailyChallenge[] = [
  // Snake — score = pellets eaten * 10 (or similar small numbers)
  { id: "snake-300", gameSlug: "snake", title: "Snake feast", description: "Score 300+ in Snake", threshold: 300 },
  { id: "snake-700", gameSlug: "snake", title: "Snake legend", description: "Score 700+ in Snake", threshold: 700 },
  // 2048
  { id: "2048-3000", gameSlug: "2048", title: "Tile climber", description: "Score 3,000+ in 2048", threshold: 3000 },
  { id: "2048-8000", gameSlug: "2048", title: "Tile master", description: "Score 8,000+ in 2048", threshold: 8000 },
  // Tetris
  { id: "tetris-1500", gameSlug: "tetris", title: "Block grinder", description: "Score 1,500+ in Tetris", threshold: 1500 },
  // Whack-a-Mole
  { id: "whack-40", gameSlug: "whack-a-mole", title: "Mole hunter", description: "Score 40+ in Whack-a-Mole", threshold: 40 },
  { id: "whack-60", gameSlug: "whack-a-mole", title: "Mole reaper", description: "Score 60+ in Whack-a-Mole", threshold: 60 },
  // Flappy
  { id: "flappy-10", gameSlug: "flappy", title: "Pipe dodger", description: "Score 10+ in Flappy", threshold: 10 },
  // Hextris
  { id: "hextris-100", gameSlug: "hextris", title: "Hex spinner", description: "Score 100+ in Hextris", threshold: 100 },
  // Breakout
  { id: "breakout-1500", gameSlug: "breakout", title: "Brick wrecker", description: "Score 1,500+ in Breakout", threshold: 1500 },
  // Doodle Jump
  { id: "doodle-1000", gameSlug: "doodle-jump", title: "Sky jumper", description: "Score 1,000+ in Doodle Jump", threshold: 1000 },
  // Chrome Dino
  { id: "dino-700", gameSlug: "chrome-dino", title: "Cactus dodger", description: "Score 700+ in Chrome Dino", threshold: 700 },
  // Match Three
  { id: "match3-7000", gameSlug: "match-three", title: "Match wizard", description: "Score 7,000+ in Match Three", threshold: 7000 },
  // Bubble Shooter
  { id: "bubbles-7000", gameSlug: "bubble-shooter", title: "Bubble buster", description: "Score 7,000+ in Bubble Shooter", threshold: 7000 },
  // Neon Runner
  { id: "neon-8000", gameSlug: "neon-runner", title: "Neon dasher", description: "Score 8,000+ in Neon Runner", threshold: 8000 },
  // Asteroids
  { id: "asteroids-2500", gameSlug: "asteroids", title: "Rock smasher", description: "Score 2,500+ in Asteroids", threshold: 2500 },
];

const POOL_BY_ID = new Map(POOL.map((c) => [c.id, c] as const));

/** YYYY-MM-DD in UTC. */
export function todayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function hashStringToInt(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

/** Pick three challenges for the given date, preferring different games. */
export function challengesForDate(dateKey: string): DailyChallenge[] {
  let s = hashStringToInt(dateKey);
  const rng = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  const shuffled = [...POOL];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const picked: DailyChallenge[] = [];
  const usedGames = new Set<string>();
  for (const ch of shuffled) {
    if (usedGames.has(ch.gameSlug)) continue;
    picked.push(ch);
    usedGames.add(ch.gameSlug);
    if (picked.length >= 3) break;
  }
  return picked;
}

export function challengeById(id: string): DailyChallenge | undefined {
  return POOL_BY_ID.get(id);
}

/** Returns IDs of any challenges this score satisfies for the given game. */
export function challengesSatisfiedBy(
  challenges: DailyChallenge[],
  gameSlug: string,
  score: number,
): DailyChallenge[] {
  return challenges.filter(
    (c) => c.gameSlug === gameSlug && score >= c.threshold,
  );
}

/** Display title for a challenge's game. Falls back to the slug. */
export function gameTitle(slug: string): string {
  return getGame(slug)?.title ?? slug;
}

/**
 * Compute a streak from a list of distinct YYYY-MM-DD strings.
 * Streak = number of consecutive days, ending at `today`, that have at
 * least one entry. Today still being unfinished doesn't kill the streak —
 * we walk back from today's date and count consecutive present dates.
 */
export function computeStreak(distinctDates: string[], today: string): number {
  const set = new Set(distinctDates);
  // If today isn't completed yet, the "live" streak is whatever ended yesterday.
  const cursor = new Date(`${today}T00:00:00Z`);
  if (!set.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (set.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}
