/**
 * Weapon spec for Krunker — pure data, no React, no Three.js.
 *
 * Damage / fire-delay / spread numbers are tuned for a fast TTK at
 * mid range. Sniper requires ADS (hip spread is intentionally
 * unusable); rifle is full-auto; pistol is tap-fire.
 */

export type WeaponKind = "pistol" | "rifle" | "sniper";

export type WeaponSpec = {
  name: string;
  kind: WeaponKind;
  damage: number;
  fireDelay: number; // seconds between shots
  hipSpread: number; // radians of cone when hip-firing
  adsSpread: number; // radians of cone when aiming down sights
  /** Recoil kick applied to camera pitch on each shot, in radians. */
  recoil: number;
  /** Random horizontal kick applied per shot. */
  recoilSide: number;
  magSize: number;
  reloadMs: number;
  auto: boolean;
  /** Sniper has an actual scope overlay. The other guns just narrow
   *  FOV when ADS-ing for a soft zoom. */
  hasScope: boolean;
  /** Used by the per-weapon sound dispatch. */
  soundKind: "click-snap" | "rifle-rip" | "sniper-boom";
};

export const WEAPONS: Record<WeaponKind, WeaponSpec> = {
  pistol: {
    name: "Pistol",
    kind: "pistol",
    damage: 28,
    fireDelay: 0.24,
    hipSpread: 0.01,
    adsSpread: 0.0025,
    recoil: 0.014,
    recoilSide: 0.008,
    magSize: 12,
    reloadMs: 1000,
    auto: false,
    hasScope: false,
    soundKind: "click-snap",
  },
  rifle: {
    name: "Rifle",
    kind: "rifle",
    damage: 16,
    fireDelay: 0.09,
    hipSpread: 0.028,
    adsSpread: 0.009,
    recoil: 0.011,
    recoilSide: 0.009,
    magSize: 30,
    reloadMs: 1600,
    auto: true,
    hasScope: false,
    soundKind: "rifle-rip",
  },
  sniper: {
    name: "Sniper",
    kind: "sniper",
    damage: 90,
    fireDelay: 1.1,
    hipSpread: 0.16, // unusable from the hip — has to be scoped
    adsSpread: 0.001,
    recoil: 0.07,
    recoilSide: 0.012,
    magSize: 5,
    reloadMs: 2200,
    auto: false,
    hasScope: true,
    soundKind: "sniper-boom",
  },
};

export const WEAPON_ORDER: WeaponKind[] = ["pistol", "rifle", "sniper"];
