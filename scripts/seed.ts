/**
 * Demo data seed. Creates ~20 fake users via Supabase Admin API and
 * seeds plausible scores across every game in the catalog so the
 * leaderboards aren't empty in screenshots.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> NEXT_PUBLIC_SUPABASE_URL=<url> \
 *     npx tsx scripts/seed.ts
 *
 * Idempotent: re-running with the same names just skips creation and
 * tops up scores. Safe to run against a dev project; do NOT run this
 * against production unless you genuinely want fake leaderboard rows.
 */

import { createClient } from "@supabase/supabase-js";
import { GAMES } from "../lib/catalog";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error(
    "[seed] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 20 plausible names. Drawn from a wider pool than the guest-name
// generator so demo users feel like real people, not "Whimsical
// Wombat 4815".
const DEMO_USERS: { email: string; displayName: string }[] = [
  { email: "alex.kim+demo@nexplay.dev", displayName: "Alex Kim" },
  { email: "priya.sharma+demo@nexplay.dev", displayName: "Priya Sharma" },
  { email: "jordan.lee+demo@nexplay.dev", displayName: "Jordan Lee" },
  { email: "maya.patel+demo@nexplay.dev", displayName: "Maya Patel" },
  { email: "diego.ramos+demo@nexplay.dev", displayName: "Diego Ramos" },
  { email: "noor.hassan+demo@nexplay.dev", displayName: "Noor Hassan" },
  { email: "sam.becker+demo@nexplay.dev", displayName: "Sam Becker" },
  { email: "ava.chen+demo@nexplay.dev", displayName: "Ava Chen" },
  { email: "leo.fischer+demo@nexplay.dev", displayName: "Leo Fischer" },
  { email: "zara.ali+demo@nexplay.dev", displayName: "Zara Ali" },
  { email: "ren.tanaka+demo@nexplay.dev", displayName: "Ren Tanaka" },
  { email: "olivia.brown+demo@nexplay.dev", displayName: "Olivia Brown" },
  { email: "kofi.mensah+demo@nexplay.dev", displayName: "Kofi Mensah" },
  { email: "sofia.rossi+demo@nexplay.dev", displayName: "Sofia Rossi" },
  { email: "ravi.iyer+demo@nexplay.dev", displayName: "Ravi Iyer" },
  { email: "elena.popov+demo@nexplay.dev", displayName: "Elena Popov" },
  { email: "marcus.wright+demo@nexplay.dev", displayName: "Marcus Wright" },
  { email: "hana.kobayashi+demo@nexplay.dev", displayName: "Hana Kobayashi" },
  { email: "ethan.miller+demo@nexplay.dev", displayName: "Ethan Miller" },
  { email: "fatima.zaidi+demo@nexplay.dev", displayName: "Fatima Zaidi" },
];

// Rough score ceilings per game — picked so the demo leaderboards
// look believable instead of "999999 points in Tic-Tac-Toe".
const SCORE_CEILING: Record<string, number> = {
  snake: 1200,
  tetris: 5000,
  "2048": 25_000,
  asteroids: 4500,
  breakout: 3500,
  flappy: 40,
  hextris: 250,
  "doodle-jump": 2500,
  "chrome-dino": 1800,
  "neon-runner": 12_000,
  "match-three": 18_000,
  "bubble-shooter": 14_000,
  "whack-a-mole": 90,
  "tower-of-hanoi": 600,
  minesweeper: 1500,
  wordle: 8,
  sudoku: 1200,
  "memory-match": 1800,
  chess: 1,
  checkers: 1,
  "connect-four": 1,
  "tic-tac-toe": 1,
  "drift-king": 9000,
  "geoguessr-clone": 4500,
  "treasure-hunt": 3500,
  krunker: 25,
  agar: 8000,
  agma: 12_000,
  slither: 8000,
  diep: 30_000,
};

function ceilingFor(slug: string): number {
  return SCORE_CEILING[slug] ?? 1000;
}

/** Pick a score that looks like a real attempt: skewed low with
 *  occasional spikes, never above the ceiling. */
function plausibleScore(ceiling: number): number {
  const r = Math.random();
  const skewed = Math.pow(r, 2.2); // bias toward smaller numbers
  return Math.max(1, Math.floor(skewed * ceiling));
}

async function ensureUser(
  email: string,
  displayName: string,
): Promise<string | null> {
  // listUsers is paginated; for 20 users the first page is fine.
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) {
    console.error(`[seed] listUsers failed:`, listErr.message);
    return null;
  }
  const existing = list.users.find((u) => u.email === email);
  if (existing) {
    return existing.id;
  }

  const { data: created, error: createErr } =
    await admin.auth.admin.createUser({
      email,
      password: crypto.randomUUID(),
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });
  if (createErr || !created.user) {
    console.error(`[seed] createUser failed for ${email}:`, createErr?.message);
    return null;
  }

  // handle_new_user trigger creates a profile, but display_name may
  // collide with another seed user's prefix. Force the desired name.
  const { error: profErr } = await admin
    .from("profiles")
    .upsert(
      { id: created.user.id, display_name: displayName, avatar_emoji: "🎮" },
      { onConflict: "id" },
    );
  if (profErr) {
    console.warn(`[seed] profile upsert failed for ${email}:`, profErr.message);
  }

  return created.user.id;
}

async function seedScoresForUser(userId: string) {
  // Each user gets 1-2 score attempts on ~60% of games.
  const rows: { user_id: string; game_slug: string; score: number }[] = [];
  for (const g of GAMES) {
    if (Math.random() > 0.6) continue;
    const tries = Math.random() > 0.6 ? 2 : 1;
    for (let i = 0; i < tries; i++) {
      rows.push({
        user_id: userId,
        game_slug: g.slug,
        score: plausibleScore(ceilingFor(g.slug)),
      });
    }
  }
  if (rows.length === 0) return;
  const { error } = await admin.from("scores").insert(rows);
  if (error) {
    console.warn(`[seed] score insert failed:`, error.message);
  }
}

async function main() {
  console.log(`[seed] Seeding ${DEMO_USERS.length} demo users…`);
  let created = 0;
  for (const u of DEMO_USERS) {
    const id = await ensureUser(u.email, u.displayName);
    if (!id) continue;
    await seedScoresForUser(id);
    created++;
    process.stdout.write(".");
  }
  console.log(`\n[seed] Done. ${created}/${DEMO_USERS.length} users seeded.`);
}

main().catch((e) => {
  console.error("[seed] crashed:", e);
  process.exit(1);
});
