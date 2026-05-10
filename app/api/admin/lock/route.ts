import { NextResponse } from "next/server";
import { setAdminCookie } from "@/lib/admin";

/** Plain POST so the form on /admin can submit without JS. Always
 *  redirects to /profile — locking from anywhere should land you in
 *  the regular UI. */
export async function POST(request: Request) {
  await setAdminCookie(false);
  return NextResponse.redirect(new URL("/profile", request.url), 303);
}
