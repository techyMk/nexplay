import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import reactHooks from "eslint-plugin-react-hooks";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated / non-source.
    "tests/**",
    "*.cjs",
    "lint-output*.txt",
  ]),
  {
    // The new (v7) react-hooks plugin ships React-Compiler-aware rules
    // that flag patterns the compiler can't auto-memoize cleanly. Many
    // of these are stylistic — e.g. assigning to ref.current in render
    // to mirror a prop is correct, just not compiler-friendly. We treat
    // them as warnings so they show up in dev without gating CI on a
    // refactor that delivers no runtime value.
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/rules-of-hooks": "error",
    },
  },
]);

export default eslintConfig;
