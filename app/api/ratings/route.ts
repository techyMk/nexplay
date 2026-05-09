import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GAMES } from "@/lib/catalog";

const VALID_SLUGS = new Set(GAMES.map((g) => g.slug));

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

  const { game_slug, rating } =
    (body as { game_slug?: string; rating?: number }) ?? {};

  if (typeof game_slug !== "string" || !VALID_SLUGS.has(game_slug)) {
    return NextResponse.json({ error: "Invalid game_slug" }, { status: 400 });
  }
  if (
    typeof rating !== "number" ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5
  ) {
    return NextResponse.json(
      { error: "Rating must be an integer 1-5" },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("game_ratings")
    .upsert(
      { user_id: user.id, game_slug, rating },
      { onConflict: "user_id,game_slug" },
    );

  if (error) {
    console.error("[POST /api/ratings]", error);
    return NextResponse.json(
      { error: `${error.code ?? "DB"}: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
