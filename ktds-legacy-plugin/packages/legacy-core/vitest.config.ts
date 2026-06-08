import { defineConfig } from "vitest/config";

// @ktds/legacy-core owns its own vitest config (mirrors @understand-anything/core).
// Invoked via `pnpm --filter @ktds/legacy-core test`.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    coverage: {
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
    },
  },
});
