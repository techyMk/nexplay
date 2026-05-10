-- User feedback / queries.
-- Anyone (signed in or not) can submit. Read access is restricted to
-- the row's owner via RLS — admin reads happen through the
-- service-role client in Supabase Studio.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  subject text not null check (length(subject) between 2 and 120),
  body text not null check (length(body) between 5 and 4000),
  created_at timestamptz not null default now(),
  status text not null default 'new'
    check (status in ('new', 'seen', 'resolved'))
);

create index if not exists feedback_created_at_idx
  on public.feedback (created_at desc);
create index if not exists feedback_status_idx on public.feedback (status);

alter table public.feedback enable row level security;

-- Anyone can submit feedback. If they're signed in, the row's
-- user_id must match their auth uid; if anonymous, user_id must be
-- null.
drop policy if exists "feedback insert any" on public.feedback;
create policy "feedback insert any" on public.feedback
  for insert with check (
    (auth.uid() is null and user_id is null)
    or auth.uid() = user_id
  );

-- A signed-in user can read their own submissions.
drop policy if exists "feedback select own" on public.feedback;
create policy "feedback select own" on public.feedback
  for select using (auth.uid() is not null and auth.uid() = user_id);
