import { NextResponse } from "next/server";
import { isAdminConfigured, isAdminEmail, setAdminCookie } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Two-phase unlock with email OTP.
 *
 *   { action: "start" }            → triggers Supabase reauthenticate(),
 *                                    which mails a 6-digit code to the
 *                                    user's verified email.
 *   { action: "verify", token }    → server-side verifyOtp(); on success
 *                                    sets the admin cookie.
 *
 * Both phases require the user to already be signed in as the admin
 * email. The OTP step ensures the unlocker currently has access to
 * that mailbox — a stolen session alone won't grant admin.
 */
export async function POST(request: Request) {
  if (!isAdminConfigured) {
    return NextResponse.json(
      { error: "Admin email not configured (ADMIN_EMAIL env var)." },
      { status: 503 },
    );
  }

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
  if (!isAdminEmail(user.email)) {
    return NextResponse.json(
      { error: "This account is not authorised for admin." },
      { status: 403 },
    );
  }

  let body: { action?: string; token?: string } | null = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body?.action;

  if (action === "start") {
    const { error } = await supabase.auth.reauthenticate();
    if (error) {
      console.error("[admin/unlock start]", error);
      return NextResponse.json(
        { error: error.message ?? "Could not send code" },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, sent: true });
  }

  if (action === "verify") {
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    if (!/^\d{6}$/.test(token)) {
      return NextResponse.json(
        { error: "Enter the 6-digit code from the email." },
        { status: 400 },
      );
    }
    const { error } = await supabase.auth.verifyOtp({
      email: user.email!,
      token,
      type: "reauthentication",
    });
    if (error) {
      console.error("[admin/unlock verify]", error);
      return NextResponse.json(
        { error: error.message ?? "Code didn't match" },
        { status: 400 },
      );
    }
    await setAdminCookie(true);
    return NextResponse.json({ ok: true, redirectTo: "/admin" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
