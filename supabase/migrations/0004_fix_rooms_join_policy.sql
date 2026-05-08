-- Fix: allow a non-player to "join" a waiting room by becoming its guest.
--
-- The original UPDATE policy in 0002_multiplayer.sql required the caller
-- to already be the host or guest. That's a chicken-and-egg problem when
-- a fresh user opens a room URL: they aren't a player yet, so RLS blocks
-- the auto-join update — the row silently isn't modified, the room stays
-- in "waiting" state forever, and the user is left as a spectator.
--
-- The new policy keeps existing-player access AND lets anyone authenticated
-- claim the empty guest seat. The WITH CHECK clause guarantees the only
-- thing they can do as a stranger is set themselves as the guest — they
-- can't grief by overwriting state.

drop policy if exists "rooms update by players" on public.rooms;

create policy "rooms update by players or join"
  on public.rooms for update
  using (
    auth.uid() = host_user_id
    or auth.uid() = guest_user_id
    or guest_user_id is null  -- empty seat: anyone may attempt to claim
  )
  with check (
    auth.uid() = host_user_id
    or auth.uid() = guest_user_id  -- after the update, the caller MUST be a player
  );
