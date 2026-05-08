import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// OAuth callback: Supabase redirects here after the provider (Google etc.)
// has authenticated the user. We exchange the short-lived `code` for a
// session and forward to wherever the user came from.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/";

  if (code) {
    const supabase = await createClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(new URL(next, url));
      }
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, url),
      );
    }
  }

  return NextResponse.redirect(new URL("/login?error=missing_code", url));
}
