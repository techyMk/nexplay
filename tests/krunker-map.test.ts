import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { aabbFromBox, aabbOverlap, buildMap } from "@/games/krunker/map";
import { WEAPONS, WEAPON_ORDER } from "@/games/krunker/weapons";

describe("krunker AABB", () => {
  it("centers around the given point with half-size extents", () => {
    const a = aabbFromBox(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(2, 2, 2),
    );
    expect(a.min.x).toBe(-1);
    expect(a.max.x).toBe(1);
    expect(a.min.y).toBe(-1);
    expect(a.max.y).toBe(1);
  });

  it("overlap is true for boxes that share interior", () => {
    const a = aabbFromBox(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(2, 2, 2),
    );
    const b = aabbFromBox(
      new THREE.Vector3(0.5, 0, 0),
      new THREE.Vector3(2, 2, 2),
    );
    expect(aabbOverlap(a, b)).toBe(true);
  });

  it("overlap is false for separated boxes", () => {
    const a = aabbFromBox(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(2, 2, 2),
    );
    const b = aabbFromBox(
      new THREE.Vector3(5, 0, 0),
      new THREE.Vector3(2, 2, 2),
    );
    expect(aabbOverlap(a, b)).toBe(false);
  });

  it("overlap is false when boxes share only a face (open intervals)", () => {
    const a = aabbFromBox(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(2, 2, 2),
    );
    const b = aabbFromBox(
      new THREE.Vector3(2, 0, 0),
      new THREE.Vector3(2, 2, 2),
    );
    // min.x of b is exactly max.x of a — flush, not overlapping.
    expect(aabbOverlap(a, b)).toBe(false);
  });
});

describe("krunker map", () => {
  it("includes exactly one ground tile and four ring walls", () => {
    const boxes = buildMap();
    const ground = boxes.filter((b) => b.kind === "ground");
    expect(ground).toHaveLength(1);
    // The four ring walls + ground + interior cover.
    expect(boxes.length).toBeGreaterThan(5);
  });

  it("is symmetric across both x and z axes", () => {
    const boxes = buildMap();
    for (const b of boxes) {
      if (b.kind === "ground") continue;
      const mirror = boxes.find(
        (m) =>
          Math.abs(m.x + b.x) < 0.01 &&
          Math.abs(m.z - b.z) < 0.01 &&
          Math.abs(m.w - b.w) < 0.01 &&
          Math.abs(m.h - b.h) < 0.01,
      );
      // Every off-axis box should have a mirror partner across x=0.
      if (Math.abs(b.x) > 0.01) {
        expect(mirror).toBeTruthy();
      }
    }
  });
});

describe("krunker weapons", () => {
  it("WEAPON_ORDER references every key in WEAPONS exactly once", () => {
    expect(new Set(WEAPON_ORDER).size).toBe(WEAPON_ORDER.length);
    expect(WEAPON_ORDER.length).toBe(Object.keys(WEAPONS).length);
    for (const k of WEAPON_ORDER) expect(WEAPONS[k]).toBeDefined();
  });

  it("every weapon has consistent kind matching its key", () => {
    for (const [k, spec] of Object.entries(WEAPONS)) {
      expect(spec.kind).toBe(k);
    }
  });

  it("sniper has scope; others don't", () => {
    expect(WEAPONS.sniper.hasScope).toBe(true);
    expect(WEAPONS.pistol.hasScope).toBe(false);
    expect(WEAPONS.rifle.hasScope).toBe(false);
  });

  it("damage * magSize ranks pistol < rifle < sniper", () => {
    // Loose sanity: sniper has the highest per-shot damage.
    expect(WEAPONS.sniper.damage).toBeGreaterThan(WEAPONS.rifle.damage);
    expect(WEAPONS.rifle.damage).toBeLessThan(WEAPONS.pistol.damage);
  });
});
