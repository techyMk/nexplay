"use client";

/**
 * Guest identity helpers. A guest is anyone who has chosen "Continue
 * as guest" in the auth-choice modal and hasn't yet signed up. We
 * give them a memorable random name (adjective + animal + 4-digit
 * number) so they have a visible identity across the site — easier
 * to remember "you're playing as Whimsical Wombat 4815" than to
 * stare at a blank "Guest" placeholder.
 *
 * Names live in localStorage, are generated lazily on first call,
 * and only get cleared when the visitor upgrades to a real account
 * (handled by GuestScoreMigration).
 */

const NAME_KEY = "nexplay:guest-name";
const ID_KEY = "nexplay:guest-id";

const ADJECTIVES = [
  "Whimsical",
  "Curious",
  "Bouncing",
  "Stealthy",
  "Glowing",
  "Witty",
  "Plucky",
  "Brave",
  "Cosmic",
  "Mighty",
  "Sleepy",
  "Speedy",
  "Lucky",
  "Sharp",
  "Quick",
  "Wild",
  "Smooth",
  "Sneaky",
  "Daring",
  "Clever",
  "Jolly",
  "Nimble",
  "Radiant",
  "Mellow",
];

const ANIMALS = [
  "Wombat",
  "Capybara",
  "Badger",
  "Otter",
  "Fox",
  "Owl",
  "Penguin",
  "Hedgehog",
  "Sloth",
  "Toucan",
  "Falcon",
  "Lynx",
  "Quokka",
  "Beaver",
  "Raccoon",
  "Lemur",
  "Platypus",
  "Narwhal",
  "Axolotl",
  "Pangolin",
  "Tapir",
  "Meerkat",
  "Mongoose",
  "Octopus",
];

/** Generate a fresh random guest name. Not stable across calls —
 *  callers should use `ensureGuestIdentity()` to read or create. */
function generateName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const num = Math.floor(Math.random() * 9000) + 1000;
  return `${adj} ${animal} ${num}`;
}

function generateId(): string {
  // 8-char base36 token. Not crypto-grade, but the only thing this
  // identifies is a guest device for our own bookkeeping (eventual
  // server-side anonymous auth would replace it with a real UUID).
  return Math.random().toString(36).slice(2, 10);
}

export type GuestIdentity = { id: string; name: string };

/** Read the guest identity from localStorage, generating + persisting
 *  a fresh one on first access. Returns null if localStorage is
 *  unavailable (e.g., private mode). */
export function ensureGuestIdentity(): GuestIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    let name = localStorage.getItem(NAME_KEY);
    let id = localStorage.getItem(ID_KEY);
    if (!name) {
      name = generateName();
      localStorage.setItem(NAME_KEY, name);
    }
    if (!id) {
      id = generateId();
      localStorage.setItem(ID_KEY, id);
    }
    return { id, name };
  } catch {
    return null;
  }
}

/** Returns the existing identity without generating one. Use this
 *  when you only care about a guest who's *already* been named. */
export function readGuestIdentity(): GuestIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const name = localStorage.getItem(NAME_KEY);
    const id = localStorage.getItem(ID_KEY);
    if (!name || !id) return null;
    return { id, name };
  } catch {
    return null;
  }
}

/** Clear guest identity (called when they sign up + their scores
 *  finish migrating). The actual auth identity replaces this. */
export function clearGuestIdentity() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(NAME_KEY);
    localStorage.removeItem(ID_KEY);
  } catch {
    // ignore
  }
}
