import { NextResponse } from "next/server";
import { isAdminEmail, isAdminUnlocked } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const VALID_STATUSES = new Set(["new", "seen", "resolved"]);

export async function POST(request: Request) {
  // Two-layer guard: must be the admin email AND the cookie must be set.
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdminEmail(user?.email) || !(await isAdminUnlocked(user?.email))) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  const form = await request.formData();
  const id = form.get("id");
  const status = form.get("status");
  if (typeof id !== "string" || typeof status !== "string") {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }
  if (!VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "Bad status" }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Service-role key not configured" },
      { status: 503 },
    );
  }
  const { error } = await admin
    .from("feedback")
    .update({ status })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.redirect(new URL("/admin?tab=feedback", request.url), 303);
}
