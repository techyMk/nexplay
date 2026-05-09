-- Custom avatar uploads.
-- Public bucket so the URL stored in profiles.avatar_emoji can be loaded
-- without auth. Path layout: <user_id>/avatar-<timestamp>.webp so RLS can
-- gate writes to "the folder is your user id" — no separate ownership
-- column needed.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  1048576, -- 1 MB; we resize to 256² webp which is well under
  array['image/webp', 'image/png', 'image/jpeg']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Anyone can read avatars (the file's URL is what gets shared).
drop policy if exists "Avatars public read" on storage.objects;
create policy "Avatars public read" on storage.objects
  for select using (bucket_id = 'avatars');

-- A user can upload only into a folder named after their own user id.
drop policy if exists "Avatars upload own" on storage.objects;
create policy "Avatars upload own" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Avatars update own" on storage.objects;
create policy "Avatars update own" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Avatars delete own" on storage.objects;
create policy "Avatars delete own" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
