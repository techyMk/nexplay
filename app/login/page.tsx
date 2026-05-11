import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginClient } from "./LoginClient";

export const metadata = { title: "Log in — Nexplay" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Already signed in with a *full* account? Bounce them back where
  // they came from. Anonymous users hit this page intentionally to
  // upgrade their account — they should stay here so the form runs
  // its updateUser / linkIdentity flow against the existing row.
  const supabase = await createClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user && !user.is_anonymous) {
      const { next } = await searchParams;
      redirect(next && next.startsWith("/") ? next : "/");
    }
  }

  return (
    <Suspense fallback={null}>
      <LoginClient />
    </Suspense>
  );
}
