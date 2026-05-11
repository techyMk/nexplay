"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";

export function LoginClient() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  // Initial mode is driven by ?mode=signup so the "Create account"
  // CTAs around the site (AuthChoiceModal, Sidebar guest card,
  // HomeCTA) land on the signup form instead of the login form.
  const initialMode: "login" | "signup" =
    params.get("mode") === "signup" ? "signup" : "login";
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!isSupabaseConfigured) return <SetupNotice />;

  const signInWithGoogle = async () => {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const supabase = createClient();

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
      } else {
        router.push(next);
        router.refresh();
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName || email.split("@")[0] },
        },
      });
      if (error) {
        setError(error.message);
      } else {
        setInfo("Account created! Check your email if confirmation is enabled, then log in.");
        setMode("login");
      }
    }

    setBusy(false);
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8">
        <h1 className="text-2xl font-black mb-1">
          {mode === "login" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="text-sm text-[var(--muted)] mb-6">
          {mode === "login"
            ? "Log in to track scores and climb the leaderboards."
            : "Save scores, claim a username, climb the leaderboards."}
        </p>

        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={busy}
          className="w-full h-11 rounded-xl bg-white text-black font-bold flex items-center justify-center gap-3 border border-[var(--border)] disabled:opacity-50 hover:bg-[var(--surface-2)] transition-colors mb-4"
        >
          <svg viewBox="0 0 48 48" className="w-5 h-5" aria-hidden>
            <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
            <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
            <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
            <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
          </svg>
          Continue with Google
        </button>

        <div className="flex items-center gap-3 mb-4 text-xs text-[var(--muted)]">
          <div className="flex-1 h-px bg-[var(--border)]" />
          <span>or</span>
          <div className="flex-1 h-px bg-[var(--border)]" />
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === "signup" && (
            <Field
              label="Display name"
              type="text"
              value={displayName}
              onChange={setDisplayName}
              placeholder="GameMaster42"
              required
            />
          )}
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            required
          />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="At least 6 characters"
            required
            min={6}
          />

          {error && (
            <div className="text-sm text-red-600 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              {error}
            </div>
          )}
          {info && (
            <div className="text-sm text-emerald-600 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full h-11 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] text-white font-bold disabled:opacity-50 hover:scale-[1.02] transition-transform"
          >
            {busy ? "Working…" : mode === "login" ? "Log in" : "Sign up"}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError(null);
            setInfo(null);
          }}
          className="mt-4 text-sm text-[var(--muted)] hover:text-[var(--foreground)] w-full text-center"
        >
          {mode === "login"
            ? "Don't have an account? Sign up"
            : "Already have an account? Log in"}
        </button>
      </div>

      <p className="text-xs text-[var(--muted)] text-center mt-4">
        By continuing you agree to play fair. ✌️{" "}
        <Link href="/" className="hover:text-[var(--foreground)]">
          Back to games
        </Link>
      </p>
    </div>
  );
}

function Field(props: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  min?: number;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-[var(--muted)] block mb-1 font-bold">
        {props.label}
      </span>
      <input
        type={props.type}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        required={props.required}
        minLength={props.min}
        className="w-full h-11 px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--accent)] focus:bg-[var(--surface)] focus:outline-none text-sm transition-colors"
      />
    </label>
  );
}

function SetupNotice() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-6">
        <h1 className="text-xl font-bold mb-2">Supabase setup required</h1>
        <p className="text-sm text-[var(--muted)] mb-4">
          Accounts and leaderboards need a Supabase project. Quick setup:
        </p>
        <ol className="text-sm space-y-2 list-decimal list-inside text-[var(--muted)]">
          <li>Create a free project at <a className="text-[var(--accent)]" href="https://supabase.com" target="_blank" rel="noreferrer">supabase.com</a></li>
          <li>In <b>Project Settings → API</b>, copy your <b>Project URL</b> and <b>anon public</b> key</li>
          <li>Create <code className="bg-[var(--surface)] px-1 rounded">.env.local</code> in the project root with:
            <pre className="bg-[var(--surface)] mt-1 p-2 rounded text-xs overflow-x-auto">{`NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...`}</pre>
          </li>
          <li>In the Supabase SQL editor, run <code className="bg-[var(--surface)] px-1 rounded">supabase/migrations/0001_init.sql</code> from this project</li>
          <li>Restart <code className="bg-[var(--surface)] px-1 rounded">npm run dev</code></li>
        </ol>
      </div>
    </div>
  );
}
