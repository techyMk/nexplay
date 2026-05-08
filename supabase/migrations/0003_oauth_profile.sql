-- Improve handle_new_user so OAuth signups (Google, etc.) get a sensible
-- display name from the provider's metadata.
--
-- Apply by pasting into the Supabase SQL editor.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',  -- email/password signup
      new.raw_user_meta_data->>'full_name',     -- Google
      new.raw_user_meta_data->>'name',          -- Google fallback / GitHub
      split_part(new.email, '@', 1),
      'Player'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
