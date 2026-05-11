# Database schema

Reference for the Supabase Postgres schema that backs Nexplay. The
authoritative source is the SQL in `supabase/migrations/` — this doc
exists so reviewers can understand the data model without reading
twelve migration files.

All tables live in the `public` schema. RLS is enabled on every
table; the access patterns are summarised at the bottom.

---

## Entity overview

```
auth.users  ──┬─►  profiles            (1:1)
              ├─►  scores              (1:N — leaderboard entries)
              ├─►  game_plays          (1:N — anonymous play count)
              ├─►  game_ratings        (1:N — 1–5 stars)
              ├─►  daily_challenge_completions (1:N)
              ├─►  achievements_unlocked       (1:N)
              ├─►  friendships         (M:N — canonical user_a < user_b)
              ├─►  game_invites        (M:N — sender/recipient)
              ├─►  rooms               (host/guest for 1v1 games)
              ├─►  skribbl_rooms       (host for N-player rooms)
              └─►  feedback            (nullable — anon allowed)
```

---

## Tables

### `profiles`
One row per `auth.users`. Auto-created by the `handle_new_user()`
trigger on signup.

| Column         | Type        | Notes                                      |
| -------------- | ----------- | ------------------------------------------ |
| `id`           | uuid PK     | FK → `auth.users(id)` ON DELETE CASCADE    |
| `username`     | text UNIQUE | Optional handle                            |
| `display_name` | text        | Case-insensitive unique; auto-deduped      |
| `avatar_emoji` | text        | Default `🎮`; replaced by avatar URL later |
| `created_at`   | timestamptz | Default `now()`                            |

### `scores`
Append-only leaderboard entries. One row per submission; the
`top_scores` view deduplicates to each user's personal best per game.

| Column       | Type    | Notes                                |
| ------------ | ------- | ------------------------------------ |
| `id`         | uuid PK |                                      |
| `user_id`    | uuid    | FK → `auth.users(id)` ON DELETE CASCADE |
| `game_slug`  | text    | Indexed (`game_slug`, `score desc`)  |
| `score`      | integer | `CHECK (score >= 0)`                 |
| `created_at` | timestamptz |                                  |

### `rooms`
1v1 multiplayer match state (chess, checkers, connect-four, pong,
tic-tac-toe). The `state` JSONB column is the full game state —
schema lives in `lib/<game>.ts` types.

| Column          | Type        | Notes                                              |
| --------------- | ----------- | -------------------------------------------------- |
| `id`            | text PK     | 6-character invite code                            |
| `game_slug`     | text        | Which game                                         |
| `host_user_id`  | uuid        | FK → `auth.users(id)` ON DELETE CASCADE            |
| `guest_user_id` | uuid NULL   | FK → `auth.users(id)` ON DELETE SET NULL           |
| `state`         | jsonb       | Game-specific state                                |
| `status`        | text        | `waiting` / `playing` / `finished`                 |
| `updated_at`    | timestamptz | Touched by trigger on every update                 |

### `skribbl_rooms`
N-player drawing game. Separate table because the participant model
(JSONB array of profiles) doesn't fit `rooms.host/guest`.

| Column         | Type      | Notes                                       |
| -------------- | --------- | ------------------------------------------- |
| `id`           | text PK   | Invite code                                 |
| `host_user_id` | uuid      | FK → `auth.users(id)` ON DELETE CASCADE     |
| `state`        | jsonb     | Phase / drawer / word / scores              |
| `participants` | jsonb     | Array of `{user_id, display_name, …}`       |
| `status`       | text      | `lobby` / `playing` / `finished`            |

### `game_plays`
Anonymous play counter — no user FK, just an event log per game slug.
Used for the catalog's `plays` column on the home grid.

### `game_ratings`
Composite PK `(user_id, game_slug)` so each user has one rating per
game. Rating is `int CHECK (1..5)`.

### `friendships`
Stored canonically with `user_a < user_b` to guarantee one row per
pair regardless of who sent the request. `initiated_by` records who
sent it; `status` is `pending` / `accepted` / `blocked`.

### `game_invites`
10-minute expiring invites with state machine: `pending` → one of
`accepted` / `declined` / `expired` / `cancelled`.

| Column     | Type        | Notes                                       |
| ---------- | ----------- | ------------------------------------------- |
| `from_user`| uuid        | FK → `auth.users(id)` ON DELETE CASCADE     |
| `to_user`  | uuid        | FK → `auth.users(id)` ON DELETE CASCADE     |
| `room_id`  | text NULL   | Filled in when sender creates the room      |
| `expires_at`| timestamptz| Server default `now() + interval '10 min'`  |

### `daily_challenge_completions`
Composite PK `(user_id, challenge_date, challenge_id)`. Challenge
definitions live in `lib/daily.ts` (deterministic from date) — DB
only tracks who completed which.

### `achievements_unlocked`
Composite PK `(user_id, achievement_id)`. Definitions live in
`lib/achievements.ts`; DB only tracks unlock events.

### `feedback`
User-submitted bug reports / suggestions. `user_id` is nullable
(anonymous feedback is allowed). Body 5–4000 chars enforced via
CHECK.

---

## Views

### `top_scores`
Personal-best score per user per game, joined with display name +
avatar for the leaderboard UI.

```sql
select distinct on (game_slug, user_id)
  s.id, s.user_id, s.game_slug, s.score, s.created_at,
  p.display_name, p.avatar_emoji
from public.scores s
left join public.profiles p on p.id = s.user_id
order by game_slug, user_id, score desc, created_at asc;
```

---

## Triggers / functions

| Name                  | Purpose                                                                  |
| --------------------- | ------------------------------------------------------------------------ |
| `handle_new_user()`   | After insert on `auth.users` — auto-creates `profiles` row, dedup-name   |
| `set_updated_at()`    | Before update on `rooms`, `skribbl_rooms`, `friendships`, `game_invites` |

---

## RLS access patterns

Every public table has RLS enabled. Patterns in use:

| Pattern              | Tables                                                                 |
| -------------------- | ---------------------------------------------------------------------- |
| Public read          | profiles, scores, game_plays, game_ratings, daily_completions, achievements |
| Owner write          | scores, game_ratings, daily_completions, achievements                  |
| Host/guest only      | rooms, skribbl_rooms (with explicit "lobby join" exception)            |
| Both parties         | friendships, game_invites                                              |
| Anon + signed-in     | feedback (insert open; read scoped to owner where applicable)          |

No service-role key ever touches the edge — the only place it's used
is the `/admin` read panel, which calls it from a server component
behind an email-OTP unlock.

---

## Migration order

```
0001_init.sql              profiles, scores, top_scores view
0002_multiplayer.sql       rooms table
0003_oauth_profile.sql     display_name dedup + avatar URL
0004_fix_rooms_join_policy lobby-join policy fix
0005_rooms_delete_policy   host can delete waiting rooms
0006_skribbl.sql           skribbl_rooms
0007_plays_ratings.sql     game_plays, game_ratings
0008_social.sql            friendships, game_invites
0009_daily_challenges.sql  daily_challenge_completions
0010_achievements.sql      achievements_unlocked
0011_avatars_bucket.sql    avatars storage bucket + policies
0012_feedback.sql          feedback
```

Run them in order via the Supabase SQL editor. None are destructive —
each is `create if not exists` + `drop policy if exists … create
policy …`, so re-running an already-applied migration is a no-op.
