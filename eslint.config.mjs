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
    // Repository-local agent/tooling inputs and generated verification output are
    // not application source. Keep src, e2e, emails and scripts inside the lint gate.
    ".claude/**",
    ".claude-flow/**",
    ".playwright-mcp/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "dist/**",
    ".vercel/**",
    "supabase/.temp/**",
    "src/lib/supabase/types.ts",
  ]),
]);

export default eslintConfig;
