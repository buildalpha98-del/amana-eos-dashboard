import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/integration/setup.ts"],
    include: ["tests/integration/**/*.test.ts"],
    // Integration tests hit a real database — run sequentially.
    // `sequence.concurrent: false` disables within-file concurrency, but vitest
    // runs FILES in parallel workers by default. `cleanupTestData()` in one file
    // will wipe rows that another file's `beforeAll` just created, producing
    // FK violations. `fileParallelism: false` serializes file execution.
    sequence: { concurrent: false },
    fileParallelism: false,
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
