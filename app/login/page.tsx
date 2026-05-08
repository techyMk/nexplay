"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!isSupabaseConfigured) return <SetupNotice />;

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
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              {error}
            </div>
          )}
          {info && (
            <div className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
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
          className="mt-4 text-sm text-[var(--muted)] hover:text-white w-full text-center"
        >
          {mode === "login"
            ? "Don't have an account? Sign up"
            : "Already have an account? Log in"}
        </button>
      </div>

      <p className="text-xs text-[var(--muted)] text-center mt-4">
        By continuing you agree to play fair. ✌️{" "}
        <Link href="/" className="hover:text-white">
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
      <span className="text-xs uppercase tracking-wider text-[var(--muted)] block mb-1">
        {props.label}
      </span>
      <input
        type={props.type}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        required={props.required}
        minLength={props.min}
        className="w-full h-11 px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-glow)] text-sm transition-colors"
      />
    </label>
  );
}

function SetupNotice() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-6">
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
