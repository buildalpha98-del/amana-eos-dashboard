import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    include: ["src/__tests__/**/*.test.ts", "src/__tests__/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/lib/**/*.ts"],
      exclude: [
        "src/lib/test-utils/**",
        "src/lib/email-templates.ts",
        "src/lib/ai*.ts",
        "src/lib/brevo.ts",
        "src/lib/xero*.ts",
        "src/lib/owna.ts",
        "src/lib/whatsapp*.ts",
        "src/lib/microsoft-calendar.ts",
        "src/lib/teams-notify.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
