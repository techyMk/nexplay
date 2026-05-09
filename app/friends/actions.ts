"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { pairOrder } from "@/lib/social";
import { generateRoomCode, INITIAL_TTT_STATE } from "@/lib/multiplayer";
import { INITIAL_C4_STATE } from "@/lib/connect-four";
import { INITIAL_PONG_STATE } from "@/lib/pong";
import { INITIAL_CHECKERS_STATE } from "@/lib/checkers";
import {
  generateRoomCode as generateSkribblCode,
  INITIAL_STATE as INITIAL_SKRIBBL_STATE,
} from "@/lib/skribbl/state";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireUser() {
  const supabase = await createClient();
  if (!supabase) return { supabase: null, user: null, error: "Auth not configured" } as const;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, error: "Not signed in" } as const;
  return { supabase, user, error: null } as const;
}

/** Send a friend request to the user with the given (case-insensitive) display name. */
export async function sendFriendRequest(displayName: string): Promise<ActionResult> {
  const { supabase, user, error } = await requireUser();
  if (error || !user) return { ok: false, error: error ?? "Not signed in" };

  const name = displayName.trim();
  if (!name) return { ok: false, error: "Enter a username" };

  const { data: target, error: lookupErr } = await supabase
    .from("profiles")
    .select("id, display_name")
    .ilike("display_name", name)
    .maybeSingle();
  if (lookupErr) return { ok: false, error: lookupErr.message };
  if (!target) return { ok: false, error: `No user named "${name}"` };
  if (target.id === user.id) return { ok: false, error: "That's you!" };

  const { a, b } = pairOrder(user.id, target.id);

  // Check existing
  const { data: existing } = await supabase
    .from("friendships")
    .select("status, initiated_by")
    .eq("user_a", a)
    .eq("user_b", b)
    .maybeSingle();

  if (existing) {
    if (existing.status === "accepted") {
      return { ok: false, error: "You're already friends" };
    }
    if (existing.status === "pending") {
      if (existing.initiated_by === user.id) {
        return { ok: false, error: "Request already sent" };
      }
      // The OTHER party already invited you — auto-accept here.
      const { error: upErr } = await supabase
        .from("friendships")
        .update({ status: "accepted" })
        .eq("user_a", a)
        .eq("user_b", b);
      if (upErr) return { ok: false, error: upErr.message };
      revalidatePath("/friends");
      return { ok: true };
    }
    if (existing.status === "blocked") {
      return { ok: false, error: "Cannot send request" };
    }
  }

  const { error: insertErr } = await supabase.from("friendships").insert({
    user_a: a,
    user_b: b,
    initiated_by: user.id,
    status: "pending",
  });
  if (insertErr) return { ok: false, error: insertErr.message };

  revalidatePath("/friends");
  return { ok: true };
}

export async function respondToFriendRequest(
  otherId: string,
  accept: boolean,
): Promise<ActionResult> {
  const { supabase, user, error } = await requireUser();
  if (error || !user) return { ok: false, error: error ?? "Not signed in" };

  const { a, b } = pairOrder(user.id, otherId);

  if (accept) {
    const { error: upErr } = await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("user_a", a)
      .eq("user_b", b)
      .eq("status", "pending");
    if (upErr) return { ok: false, error: upErr.message };
  } else {
    const { error: delErr } = await supabase
      .from("friendships")
      .delete()
      .eq("user_a", a)
      .eq("user_b", b);
    if (delErr) return { ok: false, error: delErr.message };
  }

  revalidatePath("/friends");
  return { ok: true };
}

/** Block a user. Replaces any existing friendship with a 'blocked' row
 *  initiated by the caller. Blocked users can't send requests or invites. */
export async function blockUser(otherId: string): Promise<ActionResult> {
  const { supabase, user, error } = await requireUser();
  if (error || !user) return { ok: false, error: error ?? "Not signed in" };
  if (otherId === user.id) return { ok: false, error: "Can't block yourself" };

  const { a, b } = pairOrder(user.id, otherId);
  const { error: upErr } = await supabase
    .from("friendships")
    .upsert(
      {
        user_a: a,
        user_b: b,
        status: "blocked",
        initiated_by: user.id,
      },
      { onConflict: "user_a,user_b" },
    );
  if (upErr) return { ok: false, error: upErr.message };

  revalidatePath("/friends");
  return { ok: true };
}

/** Unblock — only the user who blocked can lift it. Removes the row. */
export async function unblockUser(otherId: string): Promise<ActionResult> {
  const { supabase, user, error } = await requireUser();
  if (error || !user) return { ok: false, error: error ?? "Not signed in" };

  const { a, b } = pairOrder(user.id, otherId);
  const { error: delErr } = await supabase
    .from("friendships")
    .delete()
    .eq("user_a", a)
    .eq("user_b", b)
    .eq("status", "blocked")
    .eq("initiated_by", user.id);
  if (delErr) return { ok: false, error: delErr.message };

  revalidatePath("/friends");
  return { ok: true };
}

export async function unfriend(otherId: string): Promise<ActionResult> {
  const { supabase, user, error } = await requireUser();
  if (error || !user) return { ok: false, error: error ?? "Not signed in" };

  const { a, b } = pairOrder(user.id, otherId);
  const { error: delErr } = await supabase
    .from("friendships")
    .delete()
    .eq("user_a", a)
    .eq("user_b", b);
  if (delErr) return { ok: false, error: delErr.message };

  revalidatePath("/friends");
  return { ok: true };
}

/**
 * Send a play invite to a friend. Creates the multiplayer room first
 * so the recipient can jump straight in when they accept. Currently
 * supports tic-tac-toe and skribbl.
 */
export async function inviteToPlay(
  toUserId: string,
  gameSlug: "tic-tac-toe" | "skribbl" | "connect-four" | "pong" | "checkers",
): Promise<ActionResult & { roomId?: string }> {
  const { supabase, user, error } = await requireUser();
  if (error || !user) return { ok: false, error: error ?? "Not signed in" };

  // Verify they're friends
  const { a, b } = pairOrder(user.id, toUserId);
  const { data: friendship } = await supabase
    .from("friendships")
    .select("status")
    .eq("user_a", a)
    .eq("user_b", b)
    .maybeSingle();
  if (!friendship || friendship.status !== "accepted") {
    return { ok: false, error: "Not friends" };
  }

  // Create the room
  let roomId: string;
  if (gameSlug === "tic-tac-toe") {
    roomId = generateRoomCode(6);
    const { error: roomErr } = await supabase.from("rooms").insert({
      id: roomId,
      game_slug: "tic-tac-toe",
      host_user_id: user.id,
      state: INITIAL_TTT_STATE,
      status: "waiting",
    });
    if (roomErr) return { ok: false, error: roomErr.message };
  } else if (gameSlug === "connect-four") {
    roomId = generateRoomCode(6);
    const { error: roomErr } = await supabase.from("rooms").insert({
      id: roomId,
      game_slug: "connect-four",
      host_user_id: user.id,
      state: INITIAL_C4_STATE,
      status: "waiting",
    });
    if (roomErr) return { ok: false, error: roomErr.message };
  } else if (gameSlug === "pong") {
    roomId = generateRoomCode(6);
    const { error: roomErr } = await supabase.from("rooms").insert({
      id: roomId,
      game_slug: "pong",
      host_user_id: user.id,
      state: INITIAL_PONG_STATE,
      status: "waiting",
    });
    if (roomErr) return { ok: false, error: roomErr.message };
  } else if (gameSlug === "checkers") {
    roomId = generateRoomCode(6);
    const { error: roomErr } = await supabase.from("rooms").insert({
      id: roomId,
      game_slug: "checkers",
      host_user_id: user.id,
      state: INITIAL_CHECKERS_STATE,
      status: "waiting",
    });
    if (roomErr) return { ok: false, error: roomErr.message };
  } else {
    roomId = generateSkribblCode(6);
    // Look up host profile so they appear in players immediately
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, avatar_emoji")
      .eq("id", user.id)
      .single();
    const hostPlayer = {
      user_id: user.id,
      display_name:
        profile?.display_name ?? user.email?.split("@")[0] ?? "Player",
      avatar: profile?.avatar_emoji ?? "liam",
      score: 0,
    };
    const { error: roomErr } = await supabase.from("skribbl_rooms").insert({
      id: roomId,
      host_user_id: user.id,
      state: { ...INITIAL_SKRIBBL_STATE, players: [hostPlayer] },
      participants: [user.id],
      status: "lobby",
    });
    if (roomErr) return { ok: false, error: roomErr.message };
  }

  // Insert the invite
  const { error: invErr } = await supabase.from("game_invites").insert({
    from_user: user.id,
    to_user: toUserId,
    game_slug: gameSlug,
    room_id: roomId,
    status: "pending",
  });
  if (invErr) return { ok: false, error: invErr.message };

  revalidatePath("/friends");
  return { ok: true, roomId };
}

export async function respondToInvite(
  inviteId: string,
  accept: boolean,
): Promise<ActionResult & { redirectTo?: string }> {
  const { supabase, user, error } = await requireUser();
  if (error || !user) return { ok: false, error: error ?? "Not signed in" };

  const { data: invite, error: lookupErr } = await supabase
    .from("game_invites")
    .select("id, from_user, to_user, game_slug, room_id, status, expires_at")
    .eq("id", inviteId)
    .single();
  if (lookupErr || !invite) return { ok: false, error: "Invite not found" };
  if (invite.to_user !== user.id) return { ok: false, error: "Not your invite" };
  if (invite.status !== "pending") return { ok: false, error: `Invite already ${invite.status}` };
  if (new Date(invite.expires_at) < new Date()) {
    await supabase
      .from("game_invites")
      .update({ status: "expired" })
      .eq("id", inviteId);
    return { ok: false, error: "Invite expired" };
  }

  await supabase
    .from("game_invites")
    .update({ status: accept ? "accepted" : "declined" })
    .eq("id", inviteId);

  revalidatePath("/friends");
  if (accept && invite.room_id) {
    const path =
      invite.game_slug === "tic-tac-toe"
        ? `/multiplayer/tic-tac-toe/${invite.room_id}`
        : invite.game_slug === "connect-four"
          ? `/multiplayer/connect-four/${invite.room_id}`
          : invite.game_slug === "pong"
            ? `/multiplayer/pong/${invite.room_id}`
            : invite.game_slug === "checkers"
              ? `/multiplayer/checkers/${invite.room_id}`
              : `/multiplayer/skribbl/${invite.room_id}`;
    return { ok: true, redirectTo: path };
  }
  return { ok: true };
}
