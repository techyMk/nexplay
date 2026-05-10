import { NextResponse } from "next/server";
import { ADMIN_CONFIRM_PHRASE, isAdminEmail, setAdminCookie } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

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

  // Email is the source of truth — Supabase already verified it at
  // signup, so owning the address means owning admin.
  if (!isAdminEmail(user.email)) {
    return NextResponse.json(
      { error: "This account is not authorised for admin." },
      { status: 403 },
    );
  }

  // Typed-confirmation step — must match the phrase exactly (case-
  // insensitive, trimmed). Prevents accidental clicks.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const phrase =
    typeof (body as { phrase?: string })?.phrase === "string"
      ? (body as { phrase: string }).phrase.trim()
      : "";
  if (phrase.toLowerCase() !== ADMIN_CONFIRM_PHRASE.toLowerCase()) {
    return NextResponse.json(
      { error: `Type "${ADMIN_CONFIRM_PHRASE}" exactly to confirm.` },
      { status: 400 },
    );
  }

  await setAdminCookie(true);
  return NextResponse.json({ ok: true, redirectTo: "/admin" });
}
