import { describe, it, expect } from "vitest";
import {
  challengesForDate,
  challengesSatisfiedBy,
  computeStreak,
  todayKey,
} from "@/lib/daily";

describe("daily challenges", () => {
  it("picks exactly three challenges per day", () => {
    const c = challengesForDate("2026-05-10");
    expect(c).toHaveLength(3);
  });

  it("is deterministic for a given date", () => {
    const a = challengesForDate("2026-05-10");
    const b = challengesForDate("2026-05-10");
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
  });

  it("varies between dates", () => {
    const a = challengesForDate("2026-05-10");
    const b = challengesForDate("2026-05-11");
    // Not guaranteed to differ in every slot, but at least one of three
    // should change across consecutive days with this hash.
    const overlap = a.filter((x) => b.some((y) => y.id === x.id)).length;
    expect(overlap).toBeLessThan(3);
  });

  it("never picks two challenges for the same game", () => {
    const c = challengesForDate("2026-05-10");
    const games = new Set(c.map((x) => x.gameSlug));
    expect(games.size).toBe(c.length);
  });

  it("todayKey returns YYYY-MM-DD UTC", () => {
    const k = todayKey(new Date("2026-05-10T22:00:00Z"));
    expect(k).toBe("2026-05-10");
  });

  it("flags challenges satisfied by a score", () => {
    const ch = [
      { id: "snake-300", gameSlug: "snake", title: "", description: "", threshold: 300 },
      { id: "snake-700", gameSlug: "snake", title: "", description: "", threshold: 700 },
      { id: "tetris-1500", gameSlug: "tetris", title: "", description: "", threshold: 1500 },
    ];
    const hit = challengesSatisfiedBy(ch, "snake", 500);
    expect(hit.map((c) => c.id)).toEqual(["snake-300"]);
  });

  it("returns no challenges when score is below all thresholds", () => {
    const ch = [
      { id: "snake-300", gameSlug: "snake", title: "", description: "", threshold: 300 },
    ];
    expect(challengesSatisfiedBy(ch, "snake", 10)).toEqual([]);
  });
});

describe("computeStreak", () => {
  it("counts consecutive days ending today", () => {
    expect(
      computeStreak(["2026-05-08", "2026-05-09", "2026-05-10"], "2026-05-10"),
    ).toBe(3);
  });

  it("treats missing today as still-live streak from yesterday", () => {
    expect(
      computeStreak(["2026-05-08", "2026-05-09"], "2026-05-10"),
    ).toBe(2);
  });

  it("breaks at the first gap", () => {
    expect(
      computeStreak(["2026-05-05", "2026-05-08", "2026-05-09", "2026-05-10"], "2026-05-10"),
    ).toBe(3);
  });

  it("returns 0 with no recent entries", () => {
    expect(computeStreak(["2026-04-01"], "2026-05-10")).toBe(0);
  });
});
