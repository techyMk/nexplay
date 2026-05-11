import { describe, it, expect } from "vitest";
import {
  CATEGORIES,
  GAMES,
  featuredGames,
  gamesByCategory,
  getCategory,
  getGame,
  newGames,
  popularGames,
  searchGames,
} from "@/lib/catalog";

describe("game catalog", () => {
  it("has at least 30 games", () => {
    expect(GAMES.length).toBeGreaterThanOrEqual(30);
  });

  it("every game has a unique slug", () => {
    const slugs = GAMES.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("every game's categories reference real category slugs", () => {
    const known = new Set(CATEGORIES.map((c) => c.slug));
    for (const g of GAMES) {
      for (const cat of g.categories) {
        expect(known.has(cat)).toBe(true);
      }
    }
  });

  it("every game has a non-empty title and short blurb", () => {
    for (const g of GAMES) {
      expect(g.title.length).toBeGreaterThan(0);
      expect(g.short.length).toBeGreaterThan(0);
    }
  });

  it("getGame returns the matching game", () => {
    const first = GAMES[0];
    expect(getGame(first.slug)).toEqual(first);
    expect(getGame("nonexistent-slug")).toBeUndefined();
  });

  it("getCategory returns the matching category", () => {
    expect(getCategory(CATEGORIES[0].slug)).toEqual(CATEGORIES[0]);
    expect(getCategory("nope")).toBeUndefined();
  });

  it("gamesByCategory returns only games in that category", () => {
    for (const cat of CATEGORIES) {
      const games = gamesByCategory(cat.slug);
      expect(games.every((g) => g.categories.includes(cat.slug))).toBe(true);
    }
  });

  it("featuredGames returns only featured games", () => {
    expect(featuredGames().every((g) => g.featured)).toBe(true);
  });

  it("newGames returns only new games", () => {
    expect(newGames().every((g) => g.isNew)).toBe(true);
  });

  it("popularGames sorts by plays descending and caps to limit", () => {
    const pop = popularGames(5);
    expect(pop).toHaveLength(5);
    for (let i = 1; i < pop.length; i++) {
      expect(pop[i - 1].plays).toBeGreaterThanOrEqual(pop[i].plays);
    }
  });

  it("searchGames matches title, blurb, tags, or category", () => {
    // Search by a known game's title
    const target = GAMES[0];
    const results = searchGames(target.title);
    expect(results.some((g) => g.slug === target.slug)).toBe(true);

    // Empty query returns empty
    expect(searchGames("")).toEqual([]);
    expect(searchGames("   ")).toEqual([]);

    // Garbage returns empty
    expect(searchGames("zzz-no-such-game-zzz")).toEqual([]);
  });
});
