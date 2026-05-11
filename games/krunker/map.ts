/**
 * Krunker map + AABB primitives. Pure data + math — no React, no rAF,
 * no scene objects. The component consumes `buildMap()` once, turns
 * each MapBox into a THREE mesh, and keeps the AABB list for collision.
 */

import * as THREE from "three";

const MAP_HALF = 28;

export type AABB = { min: THREE.Vector3; max: THREE.Vector3 };

export function aabbFromBox(
  center: THREE.Vector3,
  size: THREE.Vector3,
): AABB {
  const half = size.clone().multiplyScalar(0.5);
  return {
    min: center.clone().sub(half),
    max: center.clone().add(half),
  };
}

export function aabbOverlap(a: AABB, b: AABB): boolean {
  return (
    a.min.x < b.max.x &&
    a.max.x > b.min.x &&
    a.min.y < b.max.y &&
    a.max.y > b.min.y &&
    a.min.z < b.max.z &&
    a.max.z > b.min.z
  );
}

export type MapBox = {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: number;
  kind?: "wall" | "ground";
};

/** Build the arena layout: outer ring walls + interior cover. Symmetric
 *  so neither half of the map has a positional advantage. */
export function buildMap(): MapBox[] {
  const boxes: MapBox[] = [];

  boxes.push({
    x: 0,
    y: -0.5,
    z: 0,
    w: MAP_HALF * 2,
    h: 1,
    d: MAP_HALF * 2,
    color: 0x202736,
    kind: "ground",
  });

  const wallH = 5;
  const wallT = 1;
  const ringColor = 0x3b4a6b;
  boxes.push({
    x: 0,
    y: wallH / 2,
    z: -MAP_HALF - wallT / 2,
    w: MAP_HALF * 2 + wallT * 2,
    h: wallH,
    d: wallT,
    color: ringColor,
  });
  boxes.push({
    x: 0,
    y: wallH / 2,
    z: MAP_HALF + wallT / 2,
    w: MAP_HALF * 2 + wallT * 2,
    h: wallH,
    d: wallT,
    color: ringColor,
  });
  boxes.push({
    x: -MAP_HALF - wallT / 2,
    y: wallH / 2,
    z: 0,
    w: wallT,
    h: wallH,
    d: MAP_HALF * 2,
    color: ringColor,
  });
  boxes.push({
    x: MAP_HALF + wallT / 2,
    y: wallH / 2,
    z: 0,
    w: wallT,
    h: wallH,
    d: MAP_HALF * 2,
    color: ringColor,
  });

  const cover = (
    x: number,
    z: number,
    w: number,
    h: number,
    d: number,
    c: number,
  ) => boxes.push({ x, y: h / 2, z, w, h, d, color: c });

  // Central pillar
  cover(0, 0, 3, 3, 3, 0x7c5cff);
  // Mid-range cubes (4 around the centre)
  cover(-9, -9, 2, 1.6, 2, 0x4fa3ff);
  cover(9, -9, 2, 1.6, 2, 0x4fa3ff);
  cover(-9, 9, 2, 1.6, 2, 0x4fa3ff);
  cover(9, 9, 2, 1.6, 2, 0x4fa3ff);
  // Long sight-blockers near each side
  cover(-18, 0, 1.2, 2.6, 6, 0x6b7388);
  cover(18, 0, 1.2, 2.6, 6, 0x6b7388);
  cover(0, -18, 6, 2.6, 1.2, 0x6b7388);
  cover(0, 18, 6, 2.6, 1.2, 0x6b7388);
  // Tall corner posts you can run around
  cover(-22, -22, 2, 4, 2, 0xff5cae);
  cover(22, -22, 2, 4, 2, 0xff5cae);
  cover(-22, 22, 2, 4, 2, 0xff5cae);
  cover(22, 22, 2, 4, 2, 0xff5cae);

  return boxes;
}
