-- Achievements.
-- Definitions live in code (lib/achievements.ts). The DB tracks only
-- which user has unlocked which achievement and when, so adding new
-- achievements is a code-only change.

create table if not exists public.achievements_unlocked (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create index if not exists achievements_user_idx
  on public.achievements_unlocked (user_id);

alter table public.achievements_unlocked enable row level security;

drop policy if exists "achievements select all" on public.achievements_unlocked;
create policy "achievements select all" on public.achievements_unlocked
  for select using (true);

drop policy if exists "achievements insert own" on public.achievements_unlocked;
create policy "achievements insert own" on public.achievements_unlocked
  for insert with check (auth.uid() = user_id);
