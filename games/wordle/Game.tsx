"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { GameOverlay } from "@/components/games/GameOverlay";
import { SoundToggle } from "@/components/SoundToggle";
import { Sfx } from "@/lib/sound";
import { useSubmitScoreOnGameOver } from "@/lib/scores";
import { ScoreStatus } from "@/components/ScoreStatus";

const WORD_LEN = 5;
const MAX_GUESSES = 6;

/** Curated list of common English five-letter words. Doubles as the
 *  answer pool (daily / random pick) and the valid-guess set so the
 *  game accepts whatever it can offer back. */
const WORDS: string[] = [
  "ABOUT","ABOVE","ACTOR","ADULT","AFTER","AGAIN","AGENT","AGREE","AHEAD","ALARM",
  "ALBUM","ALERT","ALIEN","ALIVE","ALLOY","ALONE","ALONG","ALTAR","ALTER","AMONG",
  "ANGEL","ANGER","ANGLE","ANGRY","APART","APPLE","APPLY","ARENA","ARGUE","ARISE",
  "ARRAY","ARROW","ASIDE","ASSET","AUDIO","AUDIT","AVOID","AWAKE","AWARD","AWARE",
  "AWFUL","BACON","BADGE","BADLY","BAKER","BANJO","BASIC","BASIN","BASIS","BEACH",
  "BEAST","BEGAN","BEGIN","BEING","BELOW","BENCH","BERRY","BIRTH","BLACK","BLADE",
  "BLAME","BLANK","BLAST","BLAZE","BLEND","BLESS","BLIND","BLOCK","BLOND","BLOOD",
  "BLOOM","BLOWN","BLUNT","BLUSH","BOARD","BOAST","BONUS","BOOST","BOOTH","BOUND",
  "BRAID","BRAIN","BRAKE","BRAND","BRASS","BRAVE","BREAD","BREAK","BREED","BRICK",
  "BRIDE","BRIEF","BRINE","BRING","BRINK","BROAD","BROIL","BROKE","BROOM","BROWN",
  "BRUSH","BUILD","BUILT","BURST","CABIN","CABLE","CACHE","CAMEL","CANDY","CARGO",
  "CARRY","CARVE","CATCH","CAUSE","CHAIN","CHAIR","CHALK","CHARM","CHART","CHASE",
  "CHEAP","CHEAT","CHECK","CHEEK","CHEER","CHESS","CHEST","CHIEF","CHILD","CHILL",
  "CHIRP","CHOIR","CHOSE","CIVIC","CIVIL","CLAIM","CLASH","CLASS","CLEAN","CLEAR",
  "CLERK","CLICK","CLIFF","CLIMB","CLOCK","CLONE","CLOSE","CLOTH","CLOUD","CLOWN",
  "COACH","COAST","COMET","COMIC","CORAL","COUCH","COUGH","COULD","COUNT","COURT",
  "COVER","CRAFT","CRANE","CRASH","CRATE","CRAZY","CREAM","CREEK","CREEP","CREST",
  "CRIME","CRISP","CROSS","CROWD","CROWN","CRUSH","CRUST","CURRY","CURVE","CYCLE",
  "DAILY","DAIRY","DANCE","DEALT","DEATH","DELAY","DENSE","DEPTH","DIARY","DIRTY",
  "DISCO","DOUBT","DOUGH","DOZEN","DRAFT","DRAIN","DRAMA","DRAWN","DREAM","DRESS",
  "DRIED","DRILL","DRINK","DRIVE","DROVE","DROWN","DRUNK","DUSTY","DWARF","EAGER",
  "EAGLE","EARLY","EARTH","ELBOW","ELDER","EMPTY","ENEMY","ENJOY","ENTER","ENTRY",
  "EQUAL","ERROR","EVENT","EVERY","EXACT","EXIST","EXTRA","FAITH","FANCY","FAULT",
  "FEAST","FENCE","FERRY","FIELD","FIERY","FIFTH","FIFTY","FIGHT","FINAL","FIRST",
  "FIXED","FLAIR","FLAKE","FLAME","FLANK","FLASH","FLEET","FLESH","FLICK","FLING",
  "FLINT","FLOAT","FLOCK","FLOOD","FLOOR","FLOUR","FLOWN","FLUID","FLUSH","FLUTE",
  "FOCAL","FOCUS","FORTH","FORTY","FORUM","FOUND","FRAIL","FRAME","FRANK","FRAUD",
  "FRESH","FRONT","FROST","FROWN","FRUIT","FULLY","FUNNY","FURRY","FUZZY","GAMER",
  "GHOST","GIANT","GLADE","GLAND","GLARE","GLASS","GLEAM","GLOBE","GLORY","GLOSS",
  "GLOVE","GODLY","GORGE","GRACE","GRADE","GRAIN","GRAND","GRANT","GRAPE","GRAPH",
  "GRASP","GRASS","GRAVE","GRAVY","GRAZE","GREAT","GREED","GREEN","GREET","GRILL",
  "GRIND","GROAN","GROOM","GROSS","GROUP","GROVE","GROWN","GUARD","GUESS","GUEST",
  "GUIDE","GUILD","GUILT","HAIRY","HANDY","HAPPY","HARSH","HASTE","HASTY","HATCH",
  "HAVEN","HEART","HEAVY","HELLO","HENCE","HONEY","HONOR","HORSE","HOTEL","HOUND",
  "HOUSE","HOVER","HUMAN","HUMID","HUMOR","IDEAL","INDEX","INNER","INPUT","IRATE",
  "IVORY","JEWEL","JOINT","JOKER","JOLLY","JOUST","JUDGE","JUICE","JUICY","JUMBO",
  "JUMPY","KARMA","KAYAK","KIOSK","KNEEL","KNELT","KNIFE","KNOCK","KNOWN","LABEL",
  "LABOR","LARGE","LASER","LATER","LAUGH","LAYER","LEAFY","LEARN","LEASE","LEAVE",
  "LEDGE","LEMON","LEVEL","LIGHT","LILAC","LIVER","LOBBY","LOCAL","LOFTY","LOGIC",
  "LOOSE","LOSER","LOVER","LOWER","LOYAL","LUCKY","LUNCH","LUNGE","LURID","LYING",
  "MADAM","MAGIC","MAJOR","MAKER","MARCH","MARRY","MARSH","MATCH","MAYOR","MEANT",
  "MEDIA","MEDIC","MELON","MERCY","MERGE","MERIT","MERRY","METAL","METER","MIGHT",
  "MIRTH","MIXER","MODAL","MODEL","MONEY","MONTH","MOOSE","MORAL","MOTEL","MOTOR",
  "MOUSE","MOUTH","MOVED","MOVIE","MUSIC","NAVAL","NEEDY","NERVE","NEVER","NEWLY",
  "NICHE","NIGHT","NINTH","NOBLE","NOISE","NORTH","NOTED","NOVEL","NUDGE","NURSE",
  "OASIS","OBESE","OCEAN","OCCUR","OFFER","OFTEN","OLDER","OLIVE","ONION","OPERA",
  "ORGAN","OTHER","OTTER","OUNCE","OUTER","OWNER","OXIDE","OZONE","PADDY","PAINT",
  "PANEL","PANIC","PAPER","PARTY","PATCH","PAUSE","PEACE","PEACH","PEARL","PEDAL",
  "PENNY","PERIL","PETAL","PHASE","PHONE","PHOTO","PIANO","PICKY","PIECE","PILOT",
  "PIVOT","PIXEL","PIZZA","PLACE","PLAIN","PLANE","PLANK","PLANT","PLATE","PLAZA",
  "PLEAD","PLUMB","PLUMP","PLUSH","POINT","POUND","POWER","PRESS","PRICE","PRIDE",
  "PRIME","PRINT","PRIOR","PRIZE","PROBE","PROOF","PROSE","PROUD","PROVE","PROWL",
  "PRUNE","PULSE","PUNCH","PUPIL","PUPPY","PURSE","QUACK","QUAIL","QUAKE","QUART",
  "QUEEN","QUERY","QUEST","QUEUE","QUICK","QUIET","QUILL","QUILT","QUOTE","RACER",
  "RADAR","RADIO","RAINY","RAISE","RALLY","RANCH","RANGE","RAPID","RATIO","RAVEN",
  "REACH","READY","REALM","REBEL","REFER","RELAX","REPEL","REPLY","RHYME","RIDER",
  "RIDGE","RIFLE","RIGHT","RIGID","RIVAL","RIVER","ROAST","ROBIN","ROBOT","ROCKY",
  "ROOMY","ROUGH","ROUND","ROUSE","ROUTE","ROYAL","RUDDY","RULER","RUMOR","RURAL",
  "RUSTY","SADLY","SAINT","SALAD","SALSA","SALTY","SANDY","SAUCE","SAUNA","SAVOR",
  "SAVVY","SCALE","SCANT","SCARE","SCARF","SCENE","SCENT","SCOLD","SCONE","SCOPE",
  "SCORE","SCORN","SCOUR","SCOUT","SCRAP","SCREW","SCRUB","SCUBA","SEDAN","SEEDY",
  "SENSE","SERVE","SEVEN","SEVER","SEWER","SHACK","SHADE","SHADY","SHAFT","SHAKE",
  "SHAKY","SHALL","SHAME","SHAPE","SHARD","SHARE","SHARK","SHARP","SHAVE","SHEEP",
  "SHEER","SHEET","SHELF","SHELL","SHIFT","SHINE","SHINY","SHIRT","SHOCK","SHOOT",
  "SHORE","SHORT","SHOUT","SHOVE","SHOWN","SHOWY","SHRED","SHREW","SHRUB","SHRUG",
  "SIEGE","SIGHT","SILKY","SILLY","SIREN","SIXTY","SKATE","SKIER","SKILL","SKULL",
  "SKUNK","SLANT","SLATE","SLAVE","SLEEK","SLEEP","SLEET","SLEPT","SLICE","SLICK",
  "SLIDE","SLIME","SLIMY","SLING","SLOPE","SLOTH","SLUMP","SLUNG","SMACK","SMALL",
  "SMART","SMASH","SMEAR","SMELL","SMILE","SMITE","SMOKE","SMOKY","SNACK","SNAIL",
  "SNAKE","SNARE","SNEAK","SNEER","SNIDE","SNIFF","SNORE","SNORT","SNOWY","SOBER",
  "SOLID","SOLVE","SONAR","SORRY","SOUND","SOUTH","SPACE","SPADE","SPANK","SPARE",
  "SPARK","SPEAK","SPEAR","SPECK","SPEED","SPELL","SPEND","SPENT","SPICE","SPICY",
  "SPILL","SPINE","SPIRE","SPITE","SPLAT","SPLIT","SPOIL","SPORE","SPORT","SPRAY",
  "SPREE","SPRIG","SPUNK","SPURT","SQUAT","SQUID","STACK","STAFF","STAGE","STAID",
  "STAIN","STAIR","STAKE","STALE","STALK","STALL","STAMP","STAND","STARE","START",
  "STASH","STATE","STEAD","STEAL","STEAM","STEED","STEEL","STEEP","STEER","STERN",
  "STICK","STIFF","STILL","STILT","STING","STINK","STOLE","STOMP","STONE","STOOD",
  "STOOL","STOOP","STORE","STORK","STORM","STORY","STOVE","STRAP","STRAW","STRAY",
  "STRIP","STRUT","STUCK","STUDY","STUFF","STUMP","STUNT","STYLE","SUAVE","SUEDE",
  "SUGAR","SUNNY","SUPER","SURGE","SUSHI","SWAMP","SWARM","SWEAR","SWEAT","SWEEP",
  "SWEET","SWELL","SWEPT","SWIFT","SWILL","SWING","SWORN","SYRUP","TABLE","TAINT",
  "TAKER","TALON","TANGO","TASTE","TASTY","TEACH","TEETH","TEMPO","TENOR","TENSE",
  "TENTH","TERSE","THANK","THEIR","THERE","THESE","THICK","THIEF","THINK","THIRD",
  "THORN","THOSE","THREE","THREW","THROB","THROW","THUMB","THUMP","TIARA","TIDAL",
  "TIGHT","TIMID","TIRED","TITAN","TOAST","TODAY","TOKEN","TONIC","TOOTH","TOPAZ",
  "TOPIC","TORCH","TOTAL","TOUCH","TOUGH","TOWER","TOXIC","TRACE","TRACK","TRADE",
  "TRAIL","TRAIN","TRAIT","TRAMP","TRASH","TREAT","TREND","TRIAL","TRIBE","TRICK",
  "TRIED","TROLL","TROOP","TROUT","TRUCK","TRULY","TRUMP","TRUNK","TRUST","TRUTH",
  "TUBER","TULIP","TUMOR","TUTOR","TWINE","TWIST","ULCER","UNCLE","UNDER","UNDID",
  "UNFIT","UNIFY","UNION","UNITE","UNITY","UPSET","URBAN","USAGE","USHER","USING",
  "USUAL","VAGUE","VALID","VALOR","VALUE","VAULT","VENOM","VERSE","VIDEO","VIGIL",
  "VINYL","VIRAL","VIRUS","VISIT","VISTA","VIVID","VIXEN","VOCAL","VODKA","VOGUE",
  "VOICE","VOTER","WAFER","WAIST","WAKEN","WALTZ","WASTE","WATCH","WATER","WEARY",
  "WEIGH","WEIRD","WHALE","WHARF","WHEAT","WHEEL","WHELP","WHERE","WHICH","WHIFF",
  "WHILE","WHINE","WHIRL","WHISK","WHITE","WHOLE","WHOOP","WHOSE","WIDOW","WIELD",
  "WINCE","WINDY","WIPED","WISER","WITCH","WOMAN","WOMEN","WORLD","WORRY","WORSE",
  "WORST","WORTH","WOULD","WOUND","WOVEN","WRATH","WRECK","WREST","WRIST","WRITE",
  "WROTE","WRUNG","YACHT","YEAST","YIELD","YOUNG","YOUTH","ZEBRA","ZESTY",
];

const WORD_SET = new Set(WORDS);

type LetterState = "empty" | "filled" | "correct" | "present" | "absent";
type Mode = "daily" | "free";

const STATE_RANK: Record<Exclude<LetterState, "empty" | "filled">, number> = {
  absent: 1,
  present: 2,
  correct: 3,
};

type Stats = {
  played: number;
  won: number;
  streak: number;
  maxStreak: number;
  /** wins by guess count: index 0 = solved on guess 1, ... 5 = guess 6 */
  distribution: number[];
};

const STATS_KEY = "nexplay:wordle-stats";
const DAILY_KEY = "nexplay:wordle-daily";

/** Score awarded for solving on guess N (1-indexed). Lost runs
 *  submit 0 — the leaderboard naturally sorts wins above losses. */
const SCORE_FOR_GUESS = [600, 500, 400, 300, 200, 100];

function defaultStats(): Stats {
  return {
    played: 0,
    won: 0,
    streak: 0,
    maxStreak: 0,
    distribution: [0, 0, 0, 0, 0, 0],
  };
}

function loadStats(): Stats {
  if (typeof window === "undefined") return defaultStats();
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return defaultStats();
    const parsed = JSON.parse(raw) as Partial<Stats>;
    return {
      played: typeof parsed.played === "number" ? parsed.played : 0,
      won: typeof parsed.won === "number" ? parsed.won : 0,
      streak: typeof parsed.streak === "number" ? parsed.streak : 0,
      maxStreak:
        typeof parsed.maxStreak === "number" ? parsed.maxStreak : 0,
      distribution:
        Array.isArray(parsed.distribution) && parsed.distribution.length === 6
          ? (parsed.distribution.map((v) =>
              typeof v === "number" ? v : 0,
            ) as number[])
          : [0, 0, 0, 0, 0, 0],
    };
  } catch {
    return defaultStats();
  }
}

function saveStats(s: Stats) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(s));
  } catch {
    // localStorage can throw in private mode — stats are nice-to-have
  }
}

/** Days since 2025-01-01 in the player's local timezone. */
function dailyIndex(): number {
  const epoch = new Date(2025, 0, 1).getTime();
  const now = new Date();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  return Math.max(0, Math.floor((today - epoch) / (1000 * 60 * 60 * 24)));
}

function pickDailyWord(): string {
  return WORDS[dailyIndex() % WORDS.length];
}

function pickRandomWord(): string {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

/** Two-pass evaluation so duplicate letters in the guess don't both
 *  light up if the target only contains the letter once. */
function evaluateGuess(guess: string, target: string): LetterState[] {
  const result: LetterState[] = new Array(WORD_LEN).fill("absent");
  const remaining: string[] = [];
  for (let i = 0; i < WORD_LEN; i++) {
    if (guess[i] === target[i]) {
      result[i] = "correct";
    } else {
      remaining.push(target[i]);
    }
  }
  for (let i = 0; i < WORD_LEN; i++) {
    if (result[i] === "correct") continue;
    const idx = remaining.indexOf(guess[i]);
    if (idx >= 0) {
      result[i] = "present";
      remaining.splice(idx, 1);
    }
  }
  return result;
}

const KEYBOARD_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

type DailySave = {
  day: number;
  target: string;
  guesses: string[];
  status: "playing" | "won" | "lost";
};

function loadDaily(): DailySave | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DAILY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DailySave>;
    if (
      typeof parsed.day !== "number" ||
      typeof parsed.target !== "string" ||
      !Array.isArray(parsed.guesses) ||
      (parsed.status !== "playing" &&
        parsed.status !== "won" &&
        parsed.status !== "lost")
    ) {
      return null;
    }
    return parsed as DailySave;
  } catch {
    return null;
  }
}

function saveDaily(d: DailySave) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DAILY_KEY, JSON.stringify(d));
  } catch {
    // ignore
  }
}

export default function Wordle() {
  const [mode, setMode] = useState<Mode>("daily");
  const [target, setTarget] = useState(() => pickDailyWord());
  const [guesses, setGuesses] = useState<string[]>([]);
  const [current, setCurrent] = useState("");
  const [status, setStatus] = useState<"playing" | "won" | "lost">(
    "playing",
  );
  const [stats, setStats] = useState<Stats>(defaultStats);
  const [showStats, setShowStats] = useState(false);
  const [shakeRow, setShakeRow] = useState(-1);
  /** Index of the row currently revealing — used to delay
   *  win/lose-screen pop-up until tile flips finish. */
  const [revealingRow, setRevealingRow] = useState(-1);
  const [toast, setToast] = useState<string | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [score, setScore] = useState(0);

  // Track the last-saved daily day so an open tab can roll over at
  // midnight without a reload. Also lets the lose flow record the
  // "lost" status without re-saving.
  const submitStatus = useSubmitScoreOnGameOver(
    "wordle",
    score,
    status === "won" || status === "lost",
  );

  // Load stats + try to resume today's daily on mount
  useEffect(() => {
    setStats(loadStats());
    const saved = loadDaily();
    if (saved && saved.day === dailyIndex()) {
      setTarget(saved.target);
      setGuesses(saved.guesses);
      setStatus(saved.status);
      setMode("daily");
      if (saved.status === "won") {
        const guessNum = saved.guesses.length;
        setScore(SCORE_FOR_GUESS[guessNum - 1] ?? 100);
      }
    }
  }, []);

  // Persist daily progress whenever it changes
  useEffect(() => {
    if (mode !== "daily") return;
    saveDaily({
      day: dailyIndex(),
      target,
      guesses,
      status,
    });
  }, [mode, target, guesses, status]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1400);
  }, []);

  const handleSubmit = useCallback(() => {
    if (status !== "playing") return;
    if (revealingRow !== -1) return; // ignore while flipping
    if (current.length !== WORD_LEN) {
      showToast("Not enough letters");
      setShakeRow(guesses.length);
      Sfx.error();
      setTimeout(() => setShakeRow(-1), 450);
      return;
    }
    if (!WORD_SET.has(current)) {
      showToast("Not in word list");
      setShakeRow(guesses.length);
      Sfx.error();
      setTimeout(() => setShakeRow(-1), 450);
      return;
    }
    const guessRowIdx = guesses.length;
    const newGuesses = [...guesses, current];
    setGuesses(newGuesses);
    setCurrent("");
    setRevealingRow(guessRowIdx);
    Sfx.thud();

    const evaluation = evaluateGuess(current, target);
    const isWin = evaluation.every((s) => s === "correct");
    const totalFlipMs = WORD_LEN * 300 + 250;

    setTimeout(() => {
      setRevealingRow(-1);
      if (isWin) {
        setStatus("won");
        const guessNum = newGuesses.length;
        const won = SCORE_FOR_GUESS[guessNum - 1] ?? 100;
        setScore(won);
        Sfx.win();
        setStats((s) => {
          const nextStreak = s.streak + 1;
          const next: Stats = {
            played: s.played + 1,
            won: s.won + 1,
            streak: nextStreak,
            maxStreak: Math.max(s.maxStreak, nextStreak),
            distribution: s.distribution.map((v, i) =>
              i === guessNum - 1 ? v + 1 : v,
            ),
          };
          saveStats(next);
          return next;
        });
      } else if (newGuesses.length >= MAX_GUESSES) {
        setStatus("lost");
        Sfx.gameOver();
        setStats((s) => {
          const next: Stats = {
            ...s,
            played: s.played + 1,
            streak: 0,
          };
          saveStats(next);
          return next;
        });
      }
    }, totalFlipMs);
  }, [current, guesses, status, target, showToast, revealingRow]);

  const handleKey = useCallback(
    (key: string) => {
      if (status !== "playing") return;
      if (revealingRow !== -1) return; // can't type during reveal
      if (key === "ENTER") {
        handleSubmit();
        return;
      }
      if (key === "BACKSPACE") {
        setCurrent((c) => {
          if (c.length === 0) return c;
          Sfx.click();
          return c.slice(0, -1);
        });
        return;
      }
      if (/^[A-Z]$/.test(key) && current.length < WORD_LEN) {
        setCurrent((c) => c + key);
        Sfx.click();
      }
    },
    [current.length, status, handleSubmit, revealingRow],
  );

  // Hardware keyboard input
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleKey("ENTER");
      } else if (e.key === "Backspace") {
        e.preventDefault();
        handleKey("BACKSPACE");
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
        handleKey(e.key.toUpperCase());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleKey]);

  // Compute keyboard letter state from the guesses played so far
  const letterStates = useMemo(() => {
    const map: Record<string, "correct" | "present" | "absent"> = {};
    for (const guess of guesses) {
      const ev = evaluateGuess(guess, target);
      for (let i = 0; i < guess.length; i++) {
        const letter = guess[i];
        const state = ev[i];
        if (state === "empty" || state === "filled") continue;
        const existing = map[letter];
        if (!existing || STATE_RANK[state] > STATE_RANK[existing]) {
          map[letter] = state;
        }
      }
    }
    return map;
  }, [guesses, target]);

  const startFresh = (m: Mode) => {
    setMode(m);
    if (m === "daily") {
      const saved = loadDaily();
      if (saved && saved.day === dailyIndex()) {
        setTarget(saved.target);
        setGuesses(saved.guesses);
        setStatus(saved.status);
      } else {
        setTarget(pickDailyWord());
        setGuesses([]);
        setStatus("playing");
      }
    } else {
      setTarget(pickRandomWord());
      setGuesses([]);
      setStatus("playing");
    }
    setCurrent("");
    setShakeRow(-1);
    setRevealingRow(-1);
    setScore(0);
  };

  const newRandom = () => {
    setTarget(pickRandomWord());
    setGuesses([]);
    setCurrent("");
    setStatus("playing");
    setShakeRow(-1);
    setRevealingRow(-1);
    setScore(0);
  };

  const shareResult = async () => {
    const day = dailyIndex();
    const lines = guesses.map((g) => {
      const ev = evaluateGuess(g, target);
      return ev
        .map((s) =>
          s === "correct" ? "🟩" : s === "present" ? "🟨" : "⬛",
        )
        .join("");
    });
    const guessLabel = status === "won" ? guesses.length : "X";
    const header =
      mode === "daily"
        ? `Wordy day ${day} ${guessLabel}/${MAX_GUESSES}`
        : `Wordy free ${guessLabel}/${MAX_GUESSES}`;
    const text = `${header}\n\n${lines.join("\n")}`;
    try {
      await navigator.clipboard.writeText(text);
      setShareMsg("Copied to clipboard!");
    } catch {
      setShareMsg("Copy failed — long-press to share manually.");
    }
    setTimeout(() => setShareMsg(null), 1800);
  };

  const winRate =
    stats.played === 0 ? 0 : Math.round((stats.won / stats.played) * 100);

  return (
    <div className="absolute inset-0 flex flex-col bg-[var(--background)] text-[var(--foreground)] p-2 sm:p-3 select-none">
      {/* HUD */}
      <div className="shrink-0 flex items-center justify-center gap-2 mb-3 text-xs sm:text-sm flex-wrap">
        <div className="inline-flex rounded-lg bg-[var(--surface-2)] border border-[var(--border)] p-0.5 text-[11px]">
          <button
            onClick={() => startFresh("daily")}
            className={`px-2.5 py-1 rounded-md font-bold transition-all ${
              mode === "daily"
                ? "bg-[var(--accent)] text-white shadow-sm"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            Daily
          </button>
          <button
            onClick={() => startFresh("free")}
            className={`px-2.5 py-1 rounded-md font-bold transition-all ${
              mode === "free"
                ? "bg-[var(--accent)] text-white shadow-sm"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            Free play
          </button>
        </div>
        {mode === "daily" && (
          <span className="px-3 py-1 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] inline-flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider opacity-60">
              Day
            </span>
            <b>{dailyIndex()}</b>
          </span>
        )}
        {mode === "free" && status !== "playing" && (
          <button
            onClick={newRandom}
            className="px-3 py-1 rounded-lg bg-[var(--accent)]/20 border border-[var(--accent)]/40 hover:bg-[var(--accent)]/30 text-sm font-bold transition-colors"
          >
            ↻ New word
          </button>
        )}
        <button
          onClick={() => setShowStats(true)}
          className="px-3 py-1 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--accent)] inline-flex items-center gap-1.5 transition-colors"
          aria-label="Statistics"
        >
          📊 <b>{stats.won}</b>/{stats.played}
        </button>
        <SoundToggle />
      </div>

      {/* Toast */}
      <div className="shrink-0 h-6 mb-1 text-center">
        {toast && (
          <span className="inline-block px-3 py-1 rounded-lg bg-rose-500/20 border border-rose-400/50 text-sm font-bold text-rose-200">
            {toast}
          </span>
        )}
      </div>

      {/* Board */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3">
        <div
          className="grid gap-1"
          style={{ gridTemplateRows: `repeat(${MAX_GUESSES}, minmax(0,1fr))` }}
        >
          {Array.from({ length: MAX_GUESSES }, (_, row) => {
            const isShaking = shakeRow === row;
            const isRevealing = revealingRow === row;
            const isWonRow =
              status === "won" && row === guesses.length - 1 && !isRevealing;
            return (
              <div
                key={row}
                className={`flex gap-1 ${isShaking ? "animate-wordle-shake" : ""}`}
              >
                {Array.from({ length: WORD_LEN }, (_, col) => {
                  let letter = "";
                  let state: LetterState = "empty";
                  let revealedColour = false;
                  if (row < guesses.length) {
                    letter = guesses[row][col];
                    const ev = evaluateGuess(guesses[row], target);
                    state = ev[col];
                    revealedColour = !isRevealing || col * 300 < 0; // colour shown after the flip starts; simplified by baseline-painting in CSS
                    revealedColour = true;
                  } else if (row === guesses.length) {
                    letter = current[col] || "";
                    state = letter ? "filled" : "empty";
                  }
                  return (
                    <Tile
                      key={col}
                      letter={letter}
                      state={state}
                      flipping={isRevealing}
                      flipDelay={col * 0.3}
                      bouncing={isWonRow}
                      bounceDelay={col * 0.1}
                      revealedColour={revealedColour}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* On-screen keyboard */}
        <div className="w-full max-w-md flex flex-col gap-1.5 px-1">
          {KEYBOARD_ROWS.map((row, i) => (
            <div key={i} className="flex gap-1 justify-center">
              {i === 2 && (
                <KeyButton wide onClick={() => handleKey("ENTER")}>
                  Enter
                </KeyButton>
              )}
              {row.split("").map((key) => (
                <KeyButton
                  key={key}
                  onClick={() => handleKey(key)}
                  state={letterStates[key]}
                >
                  {key}
                </KeyButton>
              ))}
              {i === 2 && (
                <KeyButton wide onClick={() => handleKey("BACKSPACE")}>
                  ⌫
                </KeyButton>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="shrink-0 mt-2 text-[11px] text-[var(--muted)] text-center">
        Type a guess · <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--foreground)] font-mono">Enter</kbd>{" "}
        submits ·{" "}
        <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--foreground)] font-mono">⌫</kbd>{" "}
        deletes
      </div>

      {/* Stats overlay */}
      {showStats && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/65 backdrop-blur-sm rounded-xl p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-2xl p-5 text-[var(--foreground)]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-black">Statistics</h3>
              <button
                onClick={() => setShowStats(false)}
                aria-label="Close"
                className="w-7 h-7 rounded-md hover:bg-[var(--surface-2)] inline-flex items-center justify-center"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2 mb-4 text-center">
              <StatCell label="Played" value={stats.played} />
              <StatCell label="Win %" value={winRate} />
              <StatCell label="Streak" value={stats.streak} />
              <StatCell label="Max" value={stats.maxStreak} />
            </div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-bold mb-1.5">
              Guess distribution
            </div>
            <Distribution
              dist={stats.distribution}
              highlightAt={
                status === "won" ? guesses.length - 1 : -1
              }
            />
            {(status === "won" || status === "lost") && (
              <button
                onClick={shareResult}
                className="mt-4 w-full px-4 py-2 rounded-lg bg-[var(--accent)] text-white font-bold hover:scale-[1.02] transition-transform"
              >
                📋 Share result
              </button>
            )}
            {shareMsg && (
              <div className="mt-2 text-xs text-center text-[var(--muted)]">
                {shareMsg}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Win / lose overlay */}
      {(status === "won" || status === "lost") && !showStats && (
        <GameOverlay
          icon={status === "won" ? "🎉" : "🙈"}
          title={status === "won" ? "Got it!" : "Out of guesses"}
          subtitle={
            status === "won" ? (
              <>
                <b>{target}</b> in{" "}
                <b>
                  {guesses.length}/{MAX_GUESSES}
                </b>{" "}
                · streak {stats.streak}
              </>
            ) : (
              <>
                The word was <b>{target}</b>. Streak reset.
              </>
            )
          }
          primary={
            mode === "free"
              ? { label: "↻ New word", onClick: newRandom }
              : { label: "📊 See stats", onClick: () => setShowStats(true) }
          }
          secondary={{
            label: "📋 Share",
            onClick: shareResult,
          }}
        >
          {status === "won" && (
            <div className="text-3xl font-black text-emerald-400">
              +{score}
            </div>
          )}
          <ScoreStatus gameSlug="wordle" status={submitStatus} />
        </GameOverlay>
      )}
    </div>
  );
}

function Tile({
  letter,
  state,
  flipping,
  flipDelay,
  bouncing,
  bounceDelay,
  revealedColour,
}: {
  letter: string;
  state: LetterState;
  flipping: boolean;
  flipDelay: number;
  bouncing: boolean;
  bounceDelay: number;
  revealedColour: boolean;
}) {
  const isPlayed = state === "correct" || state === "present" || state === "absent";
  let bg = "bg-transparent";
  let border = "border-2 border-[var(--border)]";
  let text = "text-[var(--foreground)]";
  if (isPlayed && revealedColour) {
    border = "border-0";
    text = "text-white";
    if (state === "correct") bg = "bg-emerald-600";
    else if (state === "present") bg = "bg-amber-500";
    else bg = "bg-slate-600";
  } else if (state === "filled") {
    border = "border-2 border-[var(--border-strong)]";
    bg = "bg-[var(--surface)]";
  }
  return (
    <div
      className={`w-12 h-12 sm:w-14 sm:h-14 rounded-md flex items-center justify-center font-black text-2xl sm:text-3xl uppercase ${bg} ${border} ${text} transition-colors ${flipping ? "animate-wordle-flip" : ""} ${bouncing ? "animate-wordle-bounce" : ""}`}
      style={
        flipping
          ? { animationDelay: `${flipDelay}s` }
          : bouncing
            ? { animationDelay: `${bounceDelay}s` }
            : undefined
      }
    >
      {letter}
    </div>
  );
}

function KeyButton({
  children,
  onClick,
  state,
  wide,
}: {
  children: React.ReactNode;
  onClick: () => void;
  state?: "correct" | "present" | "absent";
  wide?: boolean;
}) {
  let cls =
    "bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--foreground)]";
  if (state === "correct") cls = "bg-emerald-600 text-white";
  else if (state === "present") cls = "bg-amber-500 text-white";
  else if (state === "absent") cls = "bg-slate-700 text-white/70";
  return (
    <button
      onClick={onClick}
      className={`h-11 sm:h-12 ${wide ? "px-3 text-[11px] sm:text-xs" : "flex-1 min-w-0 max-w-[40px] text-sm sm:text-base"} rounded font-bold transition-colors ${cls} active:scale-95`}
    >
      {children}
    </button>
  );
}

function StatCell({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-2xl font-black tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-bold">
        {label}
      </div>
    </div>
  );
}

function Distribution({
  dist,
  highlightAt,
}: {
  dist: number[];
  highlightAt: number;
}) {
  const max = Math.max(1, ...dist);
  return (
    <div className="space-y-1">
      {dist.map((count, i) => {
        const pct = (count / max) * 100;
        const isHi = i === highlightAt;
        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-3 font-bold tabular-nums text-[var(--muted)]">
              {i + 1}
            </span>
            <div className="flex-1 h-5 rounded bg-[var(--surface-2)] relative overflow-hidden">
              <div
                className={`h-full ${
                  isHi ? "bg-emerald-600" : "bg-[var(--accent)]/70"
                } transition-all`}
                style={{ width: `${Math.max(8, pct)}%` }}
              />
              <span className="absolute inset-y-0 right-2 flex items-center text-white font-bold text-[11px] tabular-nums">
                {count}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
