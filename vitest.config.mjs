import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.mjs"],
    // Playwright specs live under tests/e2e and run via `playwright test`.
    exclude: ["tests/e2e/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.mjs"],
      reporter: ["text", "html"],
    },
  },
});
