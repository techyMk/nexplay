import { createClient } from "@/lib/supabase/server";
import { BackButton } from "@/components/BackButton";
import { FeedbackForm } from "./FeedbackForm";

export const metadata = { title: "Send feedback — Nexplay" };
export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  let prefillEmail = "";
  const supabase = await createClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    prefillEmail = user?.email ?? "";
  }

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8 md:py-12">
      <div className="mb-4">
        <BackButton fallback="/" />
      </div>

      <div className="mb-6">
        <div className="text-xs uppercase tracking-widest text-[var(--muted)] font-bold mb-1">
          Talk to us
        </div>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight">
          Send feedback
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1 max-w-md">
          Found a bug, have an idea, want to flag a player, or just tell us
          what you think? Drop us a line — every message is read.
        </p>
      </div>

      <FeedbackForm prefillEmail={prefillEmail} />
    </div>
  );
}
