-- Daily challenges.
-- Challenge definitions live in code (lib/daily.ts) and are picked
-- deterministically from a date key, so the only thing the database
-- has to track is "did this user complete this challenge on this day."
-- Streaks are computed on demand by walking the user's distinct dates.

create table if not exists public.daily_challenge_completions (
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_date date not null,
  challenge_id text not null,
  score integer not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, challenge_date, challenge_id)
);

create index if not exists daily_completions_user_date_idx
  on public.daily_challenge_completions (user_id, challenge_date desc);

create index if not exists daily_completions_date_challenge_idx
  on public.daily_challenge_completions (challenge_date, challenge_id);

alter table public.daily_challenge_completions enable row level security;

drop policy if exists "daily completions select all" on public.daily_challenge_completions;
create policy "daily completions select all" on public.daily_challenge_completions
  for select using (true);

drop policy if exists "daily completions insert own" on public.daily_challenge_completions;
create policy "daily completions insert own" on public.daily_challenge_completions
  for insert with check (auth.uid() = user_id);
