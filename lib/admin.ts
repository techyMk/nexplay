// Admin gate. Access is restricted to a single email address — the
// developer's. The "verification" is two-layered:
//   1. Server-side email check on every admin page / API call.
//      The email is verified by Supabase at signup, so owning the
//      address is the source of truth.
//   2. A typed-confirmation step that sets a cookie. The cookie alone
//      grants nothing on the server, but it's how the client knows
//      whether to show the admin UI at all (so non-admin browsers
//      never see the link). Lock undoes it.

import "server-only";
import { cookies } from "next/headers";

export const ADMIN_EMAIL = "techymk.dev@gmail.com";

/** Phrase the admin must type to confirm. Case-insensitive. */
export const ADMIN_CONFIRM_PHRASE = "I AM ADMIN";

const COOKIE_NAME = "nexplay_admin";

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase();
}

/** Server-side: returns true when both checks pass — the cookie is
 *  set AND the current Supabase user's email is the admin email. */
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
      maxAge: 60 * 60 * 8, // 8h auto-expiry; user re-confirms after that
    });
  } else {
    store.delete(COOKIE_NAME);
  }
}
