/**
 * Blocking script that resolves the user's theme preference before
 * any paint, eliminating the brief flash of the wrong theme on load
 * and on hard refresh. Reads localStorage (key "nexplay:theme"); if
 * the value is missing or "system", falls back to the OS preference.
 */
const SCRIPT = `
(function() {
  try {
    var p = localStorage.getItem('nexplay:theme');
    var resolved;
    if (p === 'dark' || p === 'light') resolved = p;
    else resolved = window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark' : 'light';
    document.documentElement.dataset.theme = resolved;
  } catch (e) { /* localStorage blocked — leave default light */ }
})();
`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
