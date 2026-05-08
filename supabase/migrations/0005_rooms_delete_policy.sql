-- Allow the host to delete (close/cancel) their own room.
--
-- Without this policy, DELETEs on public.rooms are silently blocked by
-- RLS — the row is reported as "deleted" by the client but never actually
-- removed, leaving zombie rooms in the lobby.

drop policy if exists "rooms delete by host" on public.rooms;

create policy "rooms delete by host"
  on public.rooms for delete
  using (auth.uid() = host_user_id);
