import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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

    // Static assets and vendored bundles — not source we own.
    "public/**",
    "node_modules/**",
    "coverage/**",

    // Local reference scrapes (see .gitignore).
    "Campus Map _ Baylor University.html",
    "Campus Map _ Baylor University_files/**",
  ]),
]);

export default eslintConfig;
