/**
 * Tiny theme manager — light / dark / system preference. Persisted to
 * localStorage and applied via the [data-theme] attribute on <html>.
 *
 * The `applyTheme` function is also embedded into the page <head> by
 * <ThemeScript />, run inline before React hydrates, so the user never
 * sees a flash of the wrong theme.
 */

export type Theme = "light" | "dark" | "system";
export const THEME_STORAGE_KEY = "nexplay:theme";

export function resolveTheme(pref: Theme): "light" | "dark" {
  if (pref !== "system") return pref;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "dark" || stored === "light" || stored === "system"
    ? stored
    : "system";
}

export function applyTheme(pref: Theme) {
  if (typeof window === "undefined") return;
  const resolved = resolveTheme(pref);
  document.documentElement.dataset.theme = resolved;
}

export function setTheme(pref: Theme) {
  if (typeof window === "undefined") return;
  if (pref === "system") {
    window.localStorage.removeItem(THEME_STORAGE_KEY);
  } else {
    window.localStorage.setItem(THEME_STORAGE_KEY, pref);
  }
  applyTheme(pref);
  window.dispatchEvent(new CustomEvent("nexplay:theme-changed", { detail: pref }));
}
