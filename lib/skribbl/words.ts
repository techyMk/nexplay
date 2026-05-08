// Curated word list for Skribbl. Words are chosen to be:
//  - drawable in 60 seconds
//  - family-friendly
//  - culturally common across English speakers
//  - varied in difficulty

export const WORDS = [
  // Easy (everyday objects, animals)
  "apple", "banana", "carrot", "donut", "egg", "pizza", "burger", "sandwich",
  "coffee", "milk", "cheese", "bread", "cake", "cookie", "ice cream", "popcorn",
  "cat", "dog", "bird", "fish", "horse", "cow", "pig", "sheep",
  "lion", "tiger", "bear", "elephant", "monkey", "kangaroo", "giraffe", "zebra",
  "snake", "spider", "butterfly", "bee", "ant", "frog", "octopus", "shark",
  "dolphin", "whale", "penguin", "owl", "duck", "rabbit", "squirrel", "fox",

  // Things in a house
  "chair", "table", "lamp", "bed", "couch", "tv", "fridge", "microwave",
  "clock", "mirror", "book", "phone", "computer", "guitar", "piano", "drum",

  // Outside
  "tree", "flower", "mountain", "river", "ocean", "beach", "cloud", "rainbow",
  "sun", "moon", "star", "snowflake", "lightning", "tornado", "volcano", "island",

  // Vehicles
  "car", "truck", "bus", "bicycle", "motorcycle", "airplane", "boat", "rocket",
  "submarine", "helicopter", "skateboard", "scooter", "train", "tractor",

  // Sports
  "soccer", "basketball", "tennis", "baseball", "football", "skateboard",
  "hockey", "golf", "boxing", "swimming", "surfing", "skiing",

  // Concepts
  "love", "happy", "sad", "angry", "scared", "sleep", "dream", "thinking",
  "music", "dance", "party", "birthday", "vacation", "school", "library",

  // Iconic
  "robot", "alien", "ghost", "dragon", "unicorn", "vampire", "zombie", "wizard",
  "pirate", "ninja", "knight", "astronaut", "cowboy", "doctor", "chef",

  // Tools / objects
  "hammer", "wrench", "scissors", "umbrella", "backpack", "key", "lock",
  "candle", "lightbulb", "paintbrush", "camera", "telescope", "microscope",
  "binoculars", "compass", "map", "clock", "watch", "shoes", "hat",
  "glasses", "tie", "shirt", "pants", "socks",

  // Buildings / places
  "house", "castle", "church", "tower", "bridge", "tent", "lighthouse",
  "windmill", "barn", "garage", "school", "hospital", "library", "stadium",

  // Food / drink (more)
  "watermelon", "pineapple", "strawberry", "broccoli", "spaghetti", "taco",
  "sushi", "popcorn", "juice", "tea", "wine", "salt", "honey",

  // Nature (more)
  "leaf", "mushroom", "cactus", "palm tree", "rose", "sunflower", "fern",

  // Holiday
  "snowman", "christmas tree", "easter egg", "pumpkin", "fireworks",
];

export function pickWordChoices(count = 3, exclude: string[] = []): string[] {
  const pool = WORDS.filter((w) => !exclude.includes(w));
  const out: string[] = [];
  while (out.length < count && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

/** Replace letters with underscores, keep spaces visible. */
export function maskWord(word: string): string {
  return word
    .split("")
    .map((c) => (c === " " ? " " : "_"))
    .join("");
}

/** Lenient guess matching: case-insensitive, trim, collapse whitespace. */
export function isCorrectGuess(guess: string, word: string): boolean {
  const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");
  return norm(guess) === norm(word);
}
