// Achievements. Definitions are pure data plus a `progress(stats)`
// function that returns the user's current value vs. the target. An
// achievement is unlocked when progress.value >= progress.target.
//
// New achievements are a code-only change — the DB only tracks what's
// already been unlocked.

export type AchievementCategory = "play" | "skill" | "daily" | "social";

export type Achievement = {
  id: string;
  title: string;
  description: string;
  emoji: string;
  category: AchievementCategory;
  /** Target threshold for completion (used for progress bar). */
  target: number;
  /** Optional hint for locked state. */
  hint?: string;
};

/** All inputs an achievement evaluator might need. Computed once per
 *  evaluation so we don't repeat queries. */
export type AchievementStats = {
  totalPlays: number;
  bestScores: Record<string, number>; // game_slug -> best
  friendCount: number;
  streak: number;
  totalDailyCompletions: number;
  slamDays: number; // distinct days where user completed every challenge
};

export const ACHIEVEMENTS: Achievement[] = [
  // Play volume
  { id: "first-play",     title: "First steps",     description: "Submit your first score",      emoji: "🎮", category: "play",   target: 1 },
  { id: "plays-10",       title: "Getting warm",    description: "Play 10 games",                emoji: "🕹️", category: "play",   target: 10 },
  { id: "plays-100",      title: "Game enthusiast", description: "Play 100 games",               emoji: "🏆", category: "play",   target: 100 },
  { id: "plays-500",      title: "Veteran",         description: "Play 500 games",               emoji: "🎖️", category: "play",   target: 500 },

  // Daily
  { id: "first-daily",    title: "Daily debut",     description: "Complete your first daily",    emoji: "🎯", category: "daily",  target: 1 },
  { id: "streak-3",       title: "On a roll",       description: "Hit a 3-day streak",           emoji: "🔥", category: "daily",  target: 3 },
  { id: "streak-7",       title: "Week warrior",    description: "Hit a 7-day streak",           emoji: "🔥", category: "daily",  target: 7 },
  { id: "streak-30",      title: "Unstoppable",     description: "Hit a 30-day streak",          emoji: "👑", category: "daily",  target: 30 },
  { id: "daily-slam-1",   title: "Daily slam",      description: "Beat all 3 daily challenges in one day", emoji: "💯", category: "daily", target: 1 },
  { id: "daily-slam-5",   title: "Slam squad",      description: "Slam 5 different days",        emoji: "🌟", category: "daily",  target: 5 },

  // Skill
  { id: "snake-1000",     title: "Snake supreme",   description: "Score 1,000+ in Snake",        emoji: "🐍", category: "skill",  target: 1000 },
  { id: "2048-10000",     title: "2048 master",     description: "Score 10,000+ in 2048",        emoji: "🧩", category: "skill",  target: 10000 },
  { id: "tetris-5000",    title: "Tetris pro",      description: "Score 5,000+ in Tetris",       emoji: "🟦", category: "skill",  target: 5000 },
  { id: "flappy-25",      title: "Flappy ace",      description: "Score 25+ in Flappy",          emoji: "🐤", category: "skill",  target: 25 },
  { id: "whack-100",      title: "Mole tyrant",     description: "Score 100+ in Whack-a-Mole",   emoji: "🔨", category: "skill",  target: 100 },

  // Social
  { id: "first-friend",   title: "Better together", description: "Add your first friend",        emoji: "🤝", category: "social", target: 1 },
  { id: "five-friends",   title: "Squad",           description: "Have 5 friends",               emoji: "👥", category: "social", target: 5 },
];

const ACHIEVEMENT_BY_ID = new Map(
  ACHIEVEMENTS.map((a) => [a.id, a] as const),
);

export function achievementById(id: string): Achievement | undefined {
  return ACHIEVEMENT_BY_ID.get(id);
}

/** Current progress value for an achievement, given the stats. */
export function progressValue(a: Achievement, stats: AchievementStats): number {
  switch (a.id) {
    case "first-play":
    case "plays-10":
    case "plays-100":
    case "plays-500":
      return stats.totalPlays;
    case "first-daily":
      return stats.totalDailyCompletions;
    case "streak-3":
    case "streak-7":
    case "streak-30":
      return stats.streak;
    case "daily-slam-1":
    case "daily-slam-5":
      return stats.slamDays;
    case "snake-1000":
      return stats.bestScores["snake"] ?? 0;
    case "2048-10000":
      return stats.bestScores["2048"] ?? 0;
    case "tetris-5000":
      return stats.bestScores["tetris"] ?? 0;
    case "flappy-25":
      return stats.bestScores["flappy"] ?? 0;
    case "whack-100":
      return stats.bestScores["whack-a-mole"] ?? 0;
    case "first-friend":
    case "five-friends":
      return stats.friendCount;
    default:
      return 0;
  }
}

/** Returns the IDs of every achievement currently met by these stats.
 *  Caller is responsible for diffing against the user's already-unlocked set
 *  and persisting the new ones. */
export function unlockedIds(stats: AchievementStats): string[] {
  return ACHIEVEMENTS.filter((a) => progressValue(a, stats) >= a.target).map(
    (a) => a.id,
  );
}

export const CATEGORY_LABEL: Record<AchievementCategory, string> = {
  play: "Play",
  skill: "Skill",
  daily: "Daily",
  social: "Social",
};

export const CATEGORY_EMOJI: Record<AchievementCategory, string> = {
  play: "🎮",
  skill: "🎯",
  daily: "📅",
  social: "👥",
};
