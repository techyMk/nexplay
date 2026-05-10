import { NextResponse } from "next/server";
import { isAdminConfigured, isAdminEmail, setAdminCookie } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Two-phase unlock with email OTP.
 *
 *   { action: "start" }            → signInWithOtp(shouldCreateUser:false)
 *                                    mails a 6-digit code to the admin's
 *                                    verified email address.
 *   { action: "verify", token }    → verifyOtp(type:"email"); on success
 *                                    sets the admin cookie.
 *
 * Both phases require the user to already be signed in as the admin
 * email. The OTP step ensures the unlocker currently has access to
 * that mailbox — a stolen session alone won't grant admin.
 *
 * Note: we deliberately use signInWithOtp + verifyOtp(type:"email")
 * rather than auth.reauthenticate() + verifyOtp(type:"reauthentication"),
 * because the latter is inconsistently supported across supabase-js
 * versions and was returning "Token has expired or is invalid" on a
 * fresh code in production.
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
    // shouldCreateUser:false — never sign up a new account from this
    // endpoint; the admin email must already exist in auth.users.
    const { error } = await supabase.auth.signInWithOtp({
      email: user.email!,
      options: { shouldCreateUser: false },
    });
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
    // Supabase's email OTP length is configurable in the dashboard
    // (Authentication → Email Settings) and can be 6–10 digits. We
    // accept anything in that range and let verifyOtp do the real
    // check; mismatch on length usually means the user typed a
    // partial code, which we surface as a friendly error.
    if (!/^\d{6,10}$/.test(token)) {
      return NextResponse.json(
        { error: "Enter the full numeric code from the email." },
        { status: 400 },
      );
    }
    const { error } = await supabase.auth.verifyOtp({
      email: user.email!,
      token,
      type: "email",
    });
    if (error) {
      console.error("[admin/unlock verify]", error);
      return NextResponse.json(
        { error: error.message ?? "Code didn't match" },
        { status: 400 },
      );
    }
    // Re-fetch the user after verifyOtp — it issues a fresh session.
    // We must re-confirm the email match before granting the cookie,
    // in case anything weird happened between phases.
    const {
      data: { user: refreshed },
    } = await supabase.auth.getUser();
    if (!isAdminEmail(refreshed?.email)) {
      return NextResponse.json({ error: "Not authorised" }, { status: 403 });
    }
    await setAdminCookie(true);
    return NextResponse.json({ ok: true, redirectTo: "/admin" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
