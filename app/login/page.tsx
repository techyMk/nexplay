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
  // Already signed in? Bounce them back where they came from (or home).
  const supabase = await createClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
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
