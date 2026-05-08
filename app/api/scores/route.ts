import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GAMES } from "@/lib/catalog";

const VALID_SLUGS = new Set(GAMES.map((g) => g.slug));
const MAX_SCORE = 10_000_000;

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { game_slug, score } =
    (body as { game_slug?: string; score?: number }) ?? {};

  if (typeof game_slug !== "string" || !VALID_SLUGS.has(game_slug)) {
    return NextResponse.json({ error: "Invalid game_slug" }, { status: 400 });
  }
  if (
    typeof score !== "number" ||
    !Number.isFinite(score) ||
    score < 0 ||
    score > MAX_SCORE
  ) {
    return NextResponse.json({ error: "Invalid score" }, { status: 400 });
  }

  const { error } = await supabase.from("scores").insert({
    user_id: user.id,
    game_slug,
    score: Math.floor(score),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
