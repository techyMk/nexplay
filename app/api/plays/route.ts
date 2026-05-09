import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GAMES } from "@/lib/catalog";

const VALID_SLUGS = new Set(GAMES.map((g) => g.slug));

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { game_slug } = (body as { game_slug?: string }) ?? {};

  if (typeof game_slug !== "string" || !VALID_SLUGS.has(game_slug)) {
    return NextResponse.json(
      { error: `Invalid game_slug: "${game_slug}"` },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("game_plays").insert({ game_slug });

  if (error) {
    console.error("[POST /api/plays]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
