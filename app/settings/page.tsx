import { BackButton } from "@/components/BackButton";
import { SettingsClient } from "./SettingsClient";

export const metadata = { title: "Settings — Nexplay" };

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8 md:py-12">
      <div className="mb-4">
        <BackButton fallback="/" />
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="text-3xl">⚙️</div>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight">
          Settings
        </h1>
      </div>

      <SettingsClient />

      <p className="mt-8 text-xs text-[var(--muted)] text-center">
        These preferences are saved to your browser. They sync across tabs
        but not across devices.
      </p>
    </div>
  );
}
