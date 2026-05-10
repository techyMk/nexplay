// Admin gate. Access is restricted to a single email — the developer's —
// configured via the ADMIN_EMAIL environment variable. Unlock is gated
// by Supabase's reauthentication OTP: a 6-digit code is mailed to that
// inbox and verified server-side, so an attacker with a stolen session
// still can't unlock without access to the email.
//
// Two checks are required on every admin route and admin API call:
//   1. The Supabase user's email matches ADMIN_EMAIL (Supabase verifies
//      the email at signup, so owning the address is the source of
//      truth).
//   2. An HttpOnly cookie nexplay_admin=1 is set, granted only after
//      the OTP step succeeds. The cookie alone proves nothing.

import "server-only";
import { cookies } from "next/headers";

const RAW_ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";

/** Lower-cased + trimmed admin email, or empty string if unconfigured.
 *  When empty, isAdminEmail returns false for everyone — fail-secure. */
export const ADMIN_EMAIL = RAW_ADMIN_EMAIL.toLowerCase().trim();

export const isAdminConfigured = ADMIN_EMAIL.length > 0;

const COOKIE_NAME = "nexplay_admin";

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!isAdminConfigured) return false;
  if (!email) return false;
  return email.toLowerCase().trim() === ADMIN_EMAIL;
}

/** Server-side: returns true when both checks pass — the cookie is set
 *  AND the current Supabase user's email is the admin email. */
export async function isAdminUnlocked(
  authedEmail: string | null | undefined,
): Promise<boolean> {
  if (!isAdminEmail(authedEmail)) return false;
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value === "1";
}

export async function setAdminCookie(value: boolean) {
  const store = await cookies();
  if (value) {
    store.set(COOKIE_NAME, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      // Shorter session now that unlock requires email access — 4h.
      maxAge: 60 * 60 * 4,
    });
  } else {
    store.delete(COOKIE_NAME);
  }
}
