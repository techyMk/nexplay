import type { Category, Game } from "./types";

export const CATEGORIES: Category[] = [
  {
    slug: "action",
    title: "Action",
    emoji: "⚔️",
    description: "Fast-paced reflex challenges and combat games.",
  },
  {
    slug: "puzzle",
    title: "Puzzle",
    emoji: "🧩",
    description: "Brain-bending puzzles and logic games.",
  },
  {
    slug: "arcade",
    title: "Arcade",
    emoji: "🕹️",
    description: "Classic and modern arcade hits.",
  },
  {
    slug: "racing",
    title: "Racing",
    emoji: "🏎️",
    description: "Speed, drift, and outrun the competition.",
  },
  {
    slug: "2-player",
    title: "2 Player",
    emoji: "👥",
    description: "Play head-to-head with a friend.",
  },
  {
    slug: "sports",
    title: "Sports",
    emoji: "⚽",
    description: "Score goals, slam dunks, and home runs.",
  },
  {
    slug: "strategy",
    title: "Strategy",
    emoji: "♟️",
    description: "Outsmart opponents with planning and tactics.",
  },
  {
    slug: "adventure",
    title: "Adventure",
    emoji: "🗺️",
    description: "Explore worlds, solve quests, find treasure.",
  },
];

export const GAMES: Game[] = [
  {
    slug: "tic-tac-toe",
    title: "Tic-Tac-Toe",
    short: "Classic 3-in-a-row, online with friends.",
    description:
      "The timeless paper-and-pencil game, now playable online with anyone in the world. Quick, simple, endlessly fun.",
    categories: ["2-player", "strategy", "puzzle"],
    tags: ["multiplayer", "classic", "quick"],
    gradient: "linear-gradient(135deg, #7c5cff 0%, #ff5cae 100%)",
    glyph: "❌⭕",
    source: "custom",
    controls: ["Mouse", "Touch"],
    players: "both",
    featured: true,
    isNew: true,
    rating: 4.6,
    plays: 12_400,
  },
  {
    slug: "snake",
    title: "Snake",
    short: "Eat, grow, don't bite yourself.",
    description:
      "The arcade classic. Guide your snake to collect food and grow as long as you can without crashing.",
    categories: ["arcade", "action"],
    tags: ["classic", "highscore", "single-player"],
    gradient: "linear-gradient(135deg, #16a34a 0%, #65a30d 100%)",
    glyph: "🐍",
    source: "custom",
    controls: ["Arrow Keys", "WASD", "Touch"],
    players: "single",
    featured: true,
    rating: 4.5,
    plays: 28_900,
  },
  {
    slug: "2048",
    title: "2048",
    short: "Combine tiles, reach 2048.",
    description:
      "Slide numbered tiles to merge them. Reach 2048 — or aim higher. Devilishly addictive.",
    categories: ["puzzle"],
    tags: ["numbers", "highscore", "single-player"],
    gradient: "linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)",
    glyph: "🔢",
    source: "custom",
    controls: ["Arrow Keys", "Swipe"],
    players: "single",
    featured: true,
    rating: 4.7,
    plays: 45_300,
  },
  {
    slug: "connect-four",
    title: "Connect Four",
    short: "Drop, line up four, win.",
    description:
      "The vertical strategy classic. Drop your discs and connect four in a row before your opponent does.",
    categories: ["2-player", "strategy"],
    tags: ["multiplayer", "classic"],
    gradient: "linear-gradient(135deg, #ef4444 0%, #f59e0b 100%)",
    glyph: "🔴",
    source: "custom",
    controls: ["Mouse", "Touch"],
    players: "both",
    isNew: true,
    rating: 4.4,
    plays: 8_700,
  },
  {
    slug: "pong",
    title: "Pong",
    short: "The original — paddle vs paddle.",
    description:
      "The game that started it all. Hit the ball past your opponent's paddle to score.",
    categories: ["2-player", "arcade", "sports"],
    tags: ["classic", "multiplayer"],
    gradient: "linear-gradient(135deg, #1f2937 0%, #374151 100%)",
    glyph: "🏓",
    source: "custom",
    controls: ["W/S", "Arrow Keys"],
    players: "both",
    rating: 4.3,
    plays: 6_500,
  },
  {
    slug: "memory-match",
    title: "Memory Match",
    short: "Find the pairs, beat the clock.",
    description:
      "Flip cards to find matching pairs. Train your memory and rack up the highest score.",
    categories: ["puzzle"],
    tags: ["memory", "single-player", "casual"],
    gradient: "linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)",
    glyph: "🧠",
    source: "custom",
    controls: ["Mouse", "Touch"],
    players: "single",
    rating: 4.2,
    plays: 11_200,
  },
  {
    slug: "flappy",
    title: "Flappy",
    short: "Tap to flap. Don't crash.",
    description:
      "The notoriously difficult one-button arcade game. How far can you fly?",
    categories: ["arcade", "action"],
    tags: ["highscore", "single-player", "hard"],
    gradient: "linear-gradient(135deg, #facc15 0%, #16a34a 100%)",
    glyph: "🐦",
    source: "custom",
    controls: ["Space", "Tap"],
    players: "single",
    isNew: true,
    rating: 4.0,
    plays: 19_800,
  },
  {
    slug: "hextris",
    title: "Hextris",
    short: "Hexagonal Tetris reimagined.",
    description:
      "A fast-paced puzzle game inspired by Tetris, featuring a hexagonal grid. Match three or more.",
    categories: ["puzzle", "arcade"],
    tags: ["highscore", "single-player", "open-source"],
    gradient: "linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)",
    glyph: "⬡",
    source: "embed",
    url: "https://hextris.io",
    controls: ["Arrow Keys"],
    players: "single",
    rating: 4.5,
    plays: 22_100,
  },
  {
    slug: "neon-runner",
    title: "Neon Runner",
    short: "Endless runner through neon worlds.",
    description:
      "Run, jump, slide. Dodge obstacles in a procedurally generated neon city.",
    categories: ["action", "arcade"],
    tags: ["endless", "single-player"],
    gradient: "linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)",
    glyph: "🏃",
    source: "custom",
    controls: ["Space", "Arrow Keys"],
    players: "single",
    rating: 4.1,
    plays: 4_300,
  },
  {
    slug: "drift-king",
    title: "Drift King",
    short: "Top-down arcade racing & drifting.",
    description:
      "Master the corners with realistic drift physics. Climb the leaderboard.",
    categories: ["racing", "action"],
    tags: ["racing", "highscore"],
    gradient: "linear-gradient(135deg, #dc2626 0%, #1f2937 100%)",
    glyph: "🏎️",
    source: "custom",
    controls: ["Arrow Keys", "WASD"],
    players: "single",
    rating: 4.3,
    plays: 7_800,
  },
  {
    slug: "checkers",
    title: "Checkers",
    short: "Hop, capture, become king.",
    description:
      "Classic checkers / draughts. Play locally with a friend or challenge an opponent online.",
    categories: ["2-player", "strategy"],
    tags: ["classic", "multiplayer", "board"],
    gradient: "linear-gradient(135deg, #b91c1c 0%, #1f2937 100%)",
    glyph: "♟️",
    source: "custom",
    controls: ["Mouse", "Touch"],
    players: "both",
    rating: 4.2,
    plays: 5_900,
  },
  {
    slug: "treasure-hunt",
    title: "Treasure Hunt",
    short: "Top-down adventure & exploration.",
    description:
      "Explore caves, solve puzzles, and uncover ancient treasures in this top-down adventure.",
    categories: ["adventure", "puzzle"],
    tags: ["exploration", "single-player"],
    gradient: "linear-gradient(135deg, #ca8a04 0%, #16a34a 100%)",
    glyph: "🗝️",
    source: "custom",
    controls: ["WASD", "Arrow Keys"],
    players: "single",
    rating: 4.0,
    plays: 3_400,
  },
  {
    slug: "tetris",
    title: "Tetris",
    short: "Stack the falling blocks. Clear lines.",
    description:
      "The all-time puzzle classic. Rotate and slide tetrominoes to clear lines without stacking to the top.",
    categories: ["puzzle", "arcade"],
    tags: ["classic", "highscore", "blocks"],
    gradient: "linear-gradient(135deg, #06b6d4 0%, #7c5cff 100%)",
    glyph: "🟦",
    source: "custom",
    controls: ["Arrow Keys", "Space"],
    players: "single",
    featured: true,
    isNew: true,
    rating: 4.8,
    plays: 64_200,
  },
  {
    slug: "minesweeper",
    title: "Minesweeper",
    short: "Reveal cells. Don't hit the bomb.",
    description:
      "The Windows-era classic. Use number clues to deduce which cells are safe and flag the mines.",
    categories: ["puzzle", "strategy"],
    tags: ["classic", "logic"],
    gradient: "linear-gradient(135deg, #1f2937 0%, #ef4444 100%)",
    glyph: "💣",
    source: "custom",
    controls: ["Mouse", "Right-click"],
    players: "single",
    isNew: true,
    rating: 4.5,
    plays: 18_700,
  },
  {
    slug: "breakout",
    title: "Breakout",
    short: "Bounce, smash, repeat.",
    description:
      "The arcade brick-breaker. Bounce the ball with your paddle and clear all the bricks.",
    categories: ["arcade", "action"],
    tags: ["classic", "highscore"],
    gradient: "linear-gradient(135deg, #ef4444 0%, #facc15 100%)",
    glyph: "🧱",
    source: "custom",
    controls: ["Arrow Keys", "A/D"],
    players: "single",
    isNew: true,
    rating: 4.4,
    plays: 14_200,
  },
  {
    slug: "asteroids",
    title: "Asteroids",
    short: "Vector-graphics space shooter.",
    description:
      "Pilot your ship through an asteroid field. Rotate, thrust, and shoot to break them apart.",
    categories: ["arcade", "action"],
    tags: ["classic", "shooter", "highscore"],
    gradient: "linear-gradient(135deg, #020118 0%, #7c5cff 100%)",
    glyph: "🚀",
    source: "custom",
    controls: ["Arrow Keys", "Space"],
    players: "single",
    featured: true,
    isNew: true,
    rating: 4.6,
    plays: 22_900,
  },
  {
    slug: "whack-a-mole",
    title: "Whack-a-Mole",
    short: "30 seconds. Bonk every mole.",
    description:
      "Reflex test. Moles pop up at random — click them as fast as you can before time runs out.",
    categories: ["arcade"],
    tags: ["casual", "reflex", "highscore"],
    gradient: "linear-gradient(135deg, #ca8a04 0%, #f97316 100%)",
    glyph: "🐹",
    source: "custom",
    controls: ["Mouse", "Touch"],
    players: "single",
    isNew: true,
    rating: 4.3,
    plays: 9_400,
  },
  {
    slug: "doodle-jump",
    title: "Doodle Jump",
    short: "Jump up forever.",
    description:
      "Hop between platforms and climb as high as you can without falling.",
    categories: ["arcade", "action"],
    tags: ["highscore", "endless"],
    gradient: "linear-gradient(135deg, #84cc16 0%, #06b6d4 100%)",
    glyph: "🦘",
    source: "embed",
    url: "https://doodle-jump.co",
    controls: ["Arrow Keys"],
    players: "single",
    rating: 4.4,
    plays: 31_000,
  },
  {
    slug: "chrome-dino",
    title: "Chrome Dino",
    short: "The offline runner that's now online.",
    description:
      "Jump cacti and duck pterodactyls in the iconic browser-offline runner.",
    categories: ["arcade", "action"],
    tags: ["endless", "classic"],
    gradient: "linear-gradient(135deg, #4b5563 0%, #1f2937 100%)",
    glyph: "🦖",
    source: "embed",
    url: "https://chromedino.com",
    controls: ["Space", "Arrow Keys"],
    players: "single",
    rating: 4.6,
    plays: 88_500,
  },
  {
    slug: "wordle",
    title: "Word Master",
    short: "Six guesses, five letters.",
    description:
      "Guess the hidden 5-letter word in six tries. Letters change color to give clues.",
    categories: ["puzzle"],
    tags: ["word", "daily", "logic"],
    gradient: "linear-gradient(135deg, #16a34a 0%, #facc15 100%)",
    glyph: "📝",
    source: "embed",
    url: "https://wordlegame.org",
    controls: ["Keyboard"],
    players: "single",
    rating: 4.7,
    plays: 51_300,
  },
];

export function getGame(slug: string): Game | undefined {
  return GAMES.find((g) => g.slug === slug);
}

export function getCategory(slug: string): Category | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}

export function gamesByCategory(slug: string): Game[] {
  return GAMES.filter((g) => g.categories.includes(slug));
}

export function featuredGames(): Game[] {
  return GAMES.filter((g) => g.featured);
}

export function newGames(): Game[] {
  return GAMES.filter((g) => g.isNew);
}

export function popularGames(limit = 8): Game[] {
  return [...GAMES].sort((a, b) => b.plays - a.plays).slice(0, limit);
}

export function searchGames(query: string): Game[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return GAMES.filter((g) => {
    return (
      g.title.toLowerCase().includes(q) ||
      g.short.toLowerCase().includes(q) ||
      g.tags.some((t) => t.toLowerCase().includes(q)) ||
      g.categories.some((c) => c.toLowerCase().includes(q))
    );
  });
}
