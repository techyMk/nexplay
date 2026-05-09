// How-to-play content for every game in the catalog. Keyed by slug.
// Edit here when game logic changes; the /guide page renders this
// directly.

export type Guide = {
  /** One-sentence objective. */
  objective: string;
  /** Condensed control list, one entry per discrete action. */
  controls: string[];
  /** Numbered steps describing the moment-to-moment loop. */
  steps: string[];
  /** Optional tactical advice. */
  tips?: string[];
};

export const GUIDES: Record<string, Guide> = {
  "tic-tac-toe": {
    objective:
      "Get three of your marks in a row — horizontally, vertically, or diagonally — before the opponent.",
    controls: ["Mouse / touch — click any empty cell"],
    steps: [
      "You play X. The AI (or your friend in multiplayer) plays O.",
      "Click an empty cell to place your mark; turns alternate.",
      "Three in a row wins; if every cell is filled with no winner, it's a draw.",
    ],
    tips: [
      "Take the center on your first move when possible — it's part of the most winning lines.",
      "Set up a fork: a position with two simultaneous threats so the opponent can't block both.",
    ],
  },
  snake: {
    objective: "Eat food pellets to grow longer without crashing into yourself or the wall.",
    controls: [
      "Arrow Keys or WASD — change direction",
      "Touch — tap on mobile to swipe direction",
    ],
    steps: [
      "Your snake moves continuously in its current direction.",
      "Each pellet eaten extends your tail by one segment and slightly increases speed.",
      "Game ends when the head touches a wall or any part of the body.",
    ],
    tips: [
      "Plan loops, not straight lines — long snakes need room to turn.",
      "If trapped, hug the outer wall and circle until food appears in a safe area.",
    ],
  },
  "2048": {
    objective: "Combine numbered tiles by sliding them until you reach the 2048 tile.",
    controls: [
      "Arrow Keys or WASD — slide all tiles",
      "Swipe — on mobile",
    ],
    steps: [
      "Each move slides every tile in that direction. Tiles of the same number that touch combine into their double.",
      "After each move, a new 2 or 4 tile appears in a random empty cell.",
      "Game ends when no tile can move and no merges are possible.",
    ],
    tips: [
      "Keep your highest tile pinned in a corner; never break that anchor.",
      "Stick to two directions whenever possible (e.g. only left + down) to keep the layout sorted.",
    ],
  },
  "connect-four": {
    objective: "Be the first to align four of your discs in a row, column, or diagonal.",
    controls: ["Mouse / touch — click a column to drop your disc"],
    steps: [
      "Discs fall to the lowest empty slot in the column you click.",
      "Players alternate red and yellow.",
      "Four-in-a-row in any direction wins; full board with no winner is a draw.",
    ],
    tips: [
      "Control the center column — most winning lines pass through it.",
      "Watch diagonals carefully; they're the easiest threats to overlook.",
    ],
  },
  pong: {
    objective: "Score by bouncing the ball past your opponent's paddle.",
    controls: [
      "Player 1 (left) — W / S",
      "Player 2 (right) — ↑ / ↓",
    ],
    steps: [
      "The ball spawns and travels toward a side; intercept with your paddle.",
      "The hit point on the paddle changes the ball's angle — the further from center, the steeper the bounce.",
      "If the ball gets past you, your opponent scores.",
    ],
    tips: [
      "Aim with paddle position, not raw speed.",
      "Edge hits send the ball at sharp angles — useful when your opponent is centered.",
    ],
  },
  "memory-match": {
    objective: "Match all 8 pairs in as few moves as possible.",
    controls: ["Mouse / touch — click a card to flip it"],
    steps: [
      "Click any face-down card to flip it.",
      "Click a second card. If they match, both stay revealed; if not, they flip back.",
      "Continue until every pair is revealed. Lower move count = better.",
    ],
    tips: [
      "When you flip a card whose pair you've seen before, prioritise it before doing exploratory flips.",
    ],
  },
  flappy: {
    objective: "Fly as far as possible by flapping through the gap between pipes.",
    controls: [
      "Space, ↑, or W — flap upward",
      "Click / tap — flap on touchscreen",
    ],
    steps: [
      "Tap to nudge the bird upward; gravity pulls it down between flaps.",
      "Each pipe pair passed scores 1 point.",
      "Touching a pipe or the ground ends the run.",
    ],
    tips: [
      "Tap with rhythm — small, regular taps beat panic-flapping.",
      "Aim for the center of each gap; corner clearance is unforgiving.",
    ],
  },
  hextris: {
    objective: "Match three or more same-coloured blocks around the central hexagon.",
    controls: ["← / → — rotate the hexagon"],
    steps: [
      "Coloured blocks slide toward the hexagon from random sides.",
      "Rotate to match incoming blocks against the same-colour edge of the hex.",
      "Three or more matching blocks at the same edge clear and score.",
    ],
    tips: [
      "Set up cascades: leave one colour stacked so the next match cascades into the side beneath.",
    ],
  },
  "neon-runner": {
    objective: "Run as far as possible without crashing into obstacles.",
    controls: [
      "Space, ↑, or W — jump",
      "Click / tap — jump on touchscreen",
    ],
    steps: [
      "Your character runs automatically; tap to jump over pink blocks and yellow spikes.",
      "Speed and obstacle frequency increase the longer you survive.",
      "Score is distance + a small bonus per obstacle cleared.",
    ],
    tips: [
      "Time the jump on the rising edge of the obstacle, not the moment you see it.",
    ],
  },
  "drift-king": {
    objective: "Stay alive in oncoming traffic and rack up score from speed and survival time.",
    controls: [
      "← / → or A / D — steer",
      "↑ / W — accelerate",
      "↓ / S — brake",
    ],
    steps: [
      "Your car moves forward continuously; weave around slower cars.",
      "Score accrues from time and speed; faster = more score per second.",
      "Any collision ends the run.",
    ],
    tips: [
      "Resist the temptation to floor it — high speed leaves no reaction time when traffic clusters.",
    ],
  },
  checkers: {
    objective: "Capture every opponent piece or trap them so they cannot move.",
    controls: ["Mouse / touch — click a piece, then click a destination square"],
    steps: [
      "Pieces move diagonally one square forward onto a dark square.",
      "Jump over an adjacent enemy piece to capture it (requires the square beyond to be empty).",
      "Reach the opposite end and your piece becomes a King — moves and captures in any diagonal direction.",
    ],
    tips: [
      "Keep your back row intact early; it stops the opponent from getting easy kings.",
      "Force trades when ahead in material to simplify the endgame.",
    ],
  },
  "treasure-hunt": {
    objective: "Collect every treasure and reach the green EXIT.",
    controls: ["WASD or Arrow Keys — move in 8 directions"],
    steps: [
      "Walk around the maze; coloured tiles are walls.",
      "Pick up treasures by walking over them.",
      "Reaching EXIT ends the run. Final score = coins × 100 + a time bonus.",
    ],
    tips: [
      "Collect the farthest treasures first so the path home is straight.",
      "Skip optional treasures if their detour costs more than the time bonus they save.",
    ],
  },
  tetris: {
    objective: "Clear lines by filling rows with falling tetrominoes; survive as long as possible.",
    controls: [
      "← / → or A / D — move",
      "↑ or W — rotate",
      "↓ or S — soft drop",
      "Space — hard drop",
    ],
    steps: [
      "A new tetromino falls from the top; place it before it locks.",
      "Filled rows clear instantly. Multi-line clears (two = double, three = triple, four = Tetris) score progressively more.",
      "Speed increases each level; game ends when blocks reach the top.",
    ],
    tips: [
      "Leave the rightmost column empty most of the time and clear four lines at once with an I-piece for a Tetris.",
      "Soft drop into specific notches; rotate during fall to set up cleanly.",
    ],
  },
  minesweeper: {
    objective: "Reveal every non-mine cell without clicking a mine.",
    controls: [
      "Left-click — reveal a cell",
      "Right-click — flag / unflag a suspected mine",
    ],
    steps: [
      "Each revealed number tells you how many mines are in the 8 neighbouring cells.",
      "Use the numbers to deduce safe cells and flag mines.",
      "First click is always safe — the mine layout is generated to ensure that.",
    ],
    tips: [
      "When a number equals the count of flagged neighbours, the remaining hidden neighbours are safe — chord-click to reveal them all.",
      "Edges and corners are easier — fewer hidden neighbours means more deduction.",
    ],
  },
  breakout: {
    objective: "Clear all the bricks by bouncing the ball with your paddle.",
    controls: [
      "← / → or A / D — move paddle",
      "Space — launch the ball",
    ],
    steps: [
      "The ball is held against the paddle until you launch it.",
      "Each brick hit scores; clearing every brick wins a round.",
      "If the ball drops below the paddle you lose a life. You start with 3.",
    ],
    tips: [
      "Hitting the ball with the paddle's edge sends it at sharp angles — useful for reaching tightly-packed bricks.",
    ],
  },
  asteroids: {
    objective: "Destroy asteroids and survive as long as possible.",
    controls: [
      "← / → — rotate ship",
      "↑ — thrust forward",
      "Space — fire",
    ],
    steps: [
      "Asteroids drift around the screen and wrap to the opposite side at edges.",
      "Big asteroids split into smaller ones when shot; smallest ones are destroyed outright.",
      "Touching an asteroid destroys you. You have a short invulnerability after spawning.",
    ],
    tips: [
      "Momentum is conserved — your ship keeps moving after you stop thrusting. Use this to glide.",
      "Use the screen wrap to escape clustered asteroids.",
    ],
  },
  "whack-a-mole": {
    objective: "Bonk as many moles as possible in 30 seconds.",
    controls: ["Mouse / touch — click moles when they pop up"],
    steps: [
      "Up to three moles surface randomly across the 3×3 board.",
      "Click each one before it ducks back down.",
      "Round ends after 30 seconds; final count is your score.",
    ],
    tips: [
      "Keep your eye moving across the whole board, not fixated on one hole.",
    ],
  },
  "doodle-jump": {
    objective: "Climb as high as possible by bouncing between platforms.",
    controls: ["← / →  — move horizontally"],
    steps: [
      "Your character bounces upward automatically when it lands on a platform.",
      "Steer to land on the next platform above before you fall off-screen.",
      "Score is the height climbed.",
    ],
    tips: [
      "Be cautious of moving and disappearing platforms — confirm your landing before committing.",
    ],
  },
  "chrome-dino": {
    objective: "Run as far as possible across the desert.",
    controls: [
      "Space or ↑ — jump",
      "↓ — duck",
    ],
    steps: [
      "Cacti come from the right at increasing speed; jump them.",
      "Pterodactyls fly at varying heights — duck under high ones, jump over low ones.",
      "Hitting any obstacle ends the run.",
    ],
    tips: [
      "Time long jumps for tall cactus clusters — overcommit and you'll come down on the next one.",
    ],
  },
  wordle: {
    objective: "Guess the hidden 5-letter word within six tries.",
    controls: ["Keyboard — type letters; Enter to submit"],
    steps: [
      "Submit any 5-letter word as a guess.",
      "Each letter colours: green (right letter, right place), yellow (right letter, wrong place), grey (not in word).",
      "Use the feedback to narrow down. Six guesses total.",
    ],
    tips: [
      "Strong opener: a word with 4-5 distinct vowels/common letters like AUDIO, RAISE, ADIEU, CRANE.",
      "Don't repeat eliminated letters in subsequent guesses unless you're sure.",
    ],
  },
  sudoku: {
    objective: "Fill the 9×9 grid so each row, column, and 3×3 box contains the digits 1–9 exactly once.",
    controls: [
      "Mouse / touch — click a cell to select",
      "1–9 keys — enter a digit",
      "Backspace / 0 — clear cell",
      "Arrow keys — move selection",
    ],
    steps: [
      "Pick a difficulty (Easy / Medium / Hard).",
      "Fill cells using the numbers 1–9. Wrong entries highlight in red.",
      "Score is computed when you finish based on time and mistakes.",
    ],
    tips: [
      "Look for 'naked singles' — cells with only one possible value.",
      "Scan rows, columns, and boxes simultaneously for digits that can only fit in one cell.",
    ],
  },
  "match-three": {
    objective: "Score as much as possible by clearing gem matches in 25 moves.",
    controls: ["Mouse / touch — click two adjacent gems to swap"],
    steps: [
      "Swap two adjacent gems to create a row or column of 3+ matching gems.",
      "Matched gems clear; gems above fall down and new ones drop in.",
      "Cascades multiply your score — chains can compound rapidly.",
    ],
    tips: [
      "Hunt for swaps that make multiple matches at once.",
      "Look at the board after a clear — incoming gems often set up easy follow-up cascades.",
    ],
  },
  "tower-of-hanoi": {
    objective: "Move every disk from the left peg to the right peg.",
    controls: ["Mouse / touch — click a peg to pick up its top disk; click another to drop"],
    steps: [
      "Pick a disk count (3 to 7).",
      "Move only one disk at a time. A larger disk can never sit on top of a smaller one.",
      "Solve the puzzle in as few moves as possible — the minimum for N disks is 2^N − 1.",
    ],
    tips: [
      "The puzzle is recursive: to move N disks from A to C, first move N-1 from A to B, then the largest A→C, then N-1 from B to C.",
    ],
  },
  "bubble-shooter": {
    objective: "Pop the ceiling of bubbles by shooting groups of 3+ matching colours.",
    controls: [
      "Mouse — aim",
      "Click or Space — shoot",
    ],
    steps: [
      "Aim with the mouse pointer and fire your loaded bubble.",
      "Any bubble that lands next to two or more of its colour clears the cluster.",
      "Bubbles disconnected from the ceiling drop and award bonus points.",
    ],
    tips: [
      "Aim for the highest bubbles possible — bringing down a chunk takes lots of below-ones with it.",
      "Bank shots off the side walls reach awkward gaps.",
    ],
  },
  "agar-clone": {
    objective: "Grow your cell by absorbing smaller cells; avoid being absorbed yourself.",
    controls: [
      "Mouse — move your cell toward the cursor",
      "Space — split into two halves (extra reach, extra risk)",
      "W — eject mass (feed yourself or another cell)",
    ],
    steps: [
      "Eat dots and any cell smaller than yours.",
      "You can be eaten by any cell ~25% larger than you.",
      "Splitting can chase fast cells but leaves you smaller and exposed.",
    ],
    tips: [
      "Hover near the edge for cover. Never split when you're already cornered.",
    ],
  },
  slither: {
    objective: "Be the longest snake in the arena by collecting orbs and trapping rivals.",
    controls: [
      "Mouse — your snake follows the cursor",
      "Hold left-click — boost (consumes length)",
    ],
    steps: [
      "Eat orbs to slowly grow.",
      "When another snake's head touches your body, it dies and leaves a trail of orbs for you to harvest.",
      "If your head touches anything, you die — be especially careful boosting.",
    ],
    tips: [
      "Cut off bigger snakes by circling in front of them — they can't turn through your body.",
    ],
  },
  krunker: {
    objective: "Frag opponents in fast-paced first-person matches.",
    controls: [
      "WASD — move",
      "Mouse — aim and shoot",
      "Space — jump",
      "Shift — slide / sprint",
    ],
    steps: [
      "Pick a class with a primary weapon. Spawn into the match.",
      "Eliminate opponents while staying alive; first to the score limit wins (mode-dependent).",
    ],
    tips: [
      "Aim for headshots — significantly higher damage.",
      "Stay mobile — strafing and sliding make you a much harder target.",
    ],
  },
  skribbl: {
    objective: "Across multiple rounds, score as a drawer (your word gets guessed) and a guesser (be first to type the word).",
    controls: [
      "Drawing — mouse / touch on the canvas + colour palette",
      "Guessing — type into the chat box",
    ],
    steps: [
      "Players take turns drawing. The drawer picks one of three words and has 60 seconds.",
      "Everyone else guesses by typing in chat. Correct guesses are hidden from the room (broadcast as 'X guessed it!').",
      "Earlier correct guesses score more. The drawer scores from the average of guesser points.",
      "After every player has drawn once, the game ends and the leaderboard shows.",
    ],
    tips: [
      "Drawers: keep it simple and recognisable. Don't write letters — they'll auto-fail you.",
      "Guessers: start broad (\"animal? food?\") and narrow as the drawing develops.",
    ],
  },
  "geoguessr-clone": {
    objective: "Look at a Street View panorama and guess where on Earth you are.",
    controls: [
      "Click and drag — pan the panorama",
      "Click on the world map — place your guess",
    ],
    steps: [
      "Inspect the scene — signs, language, road markings, vegetation, sun direction, license plates.",
      "Place your guess pin on the map and submit.",
      "Score is based on how close your guess is to the real location.",
    ],
    tips: [
      "Bollard shapes, road sign colours, and writing systems are huge tells about country.",
      "Driving side (left vs right) cuts the world in half right away.",
    ],
  },
  agma: {
    objective: "Cell-eater with power-ups and game modes — be the last big cell standing.",
    controls: [
      "Mouse — move",
      "Space — split",
      "W — eject mass",
      "Q — use a power-up (varies by inventory)",
    ],
    steps: [
      "Same core as Agar.io: eat smaller, avoid bigger.",
      "Pick up power-ups around the map; they grant temporary abilities.",
    ],
    tips: [
      "Hoard power-ups for emergencies, not casual play.",
    ],
  },
  diep: {
    objective: "Pilot a tank, level up, and dominate the arena.",
    controls: [
      "WASD — move",
      "Mouse — aim and shoot",
    ],
    steps: [
      "Shoot polygons to gain XP and level up.",
      "Each level grants one upgrade point — invest in stats (HP, damage, reload, speed) and pick a class evolution.",
      "Engage other tanks once your build comes online.",
    ],
    tips: [
      "Pick a class path early and commit. Hybrid builds are weak.",
    ],
  },
};
