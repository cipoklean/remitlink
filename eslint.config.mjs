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
    // The Envio HyperIndex is a separate package (tsconfig already excludes it).
    // Its generated types + env shim use patterns the app's lint rules dislike,
    // so it is linted only through its own tooling, never by the app.
    "envio",
  ]),
]);

export default eslintConfig;
