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
  ]),
  {
    // ── Design-token rails (2026-07-11) ──────────────────────────
    // The palette lives in src/app/globals.css @theme. Raw Tailwind grays,
    // bg-white, and arbitrary hex values bypass the token layer — they render
    // wrong in dark mode and drift from the warm palette. Charts are exempt
    // (Recharts needs literal hex).
    name: "design-token-rails",
    files: ["src/components/**/*.tsx", "src/app/**/*.tsx"],
    ignores: ["src/components/charts/**"],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector:
            "JSXAttribute[name.name='className'] Literal[value=/(text|bg|border|divide|ring|placeholder)-(gray|slate|zinc|neutral)-[0-9]/]",
          message:
            "Use design tokens (text-muted, text-foreground, bg-surface, bg-card, border-border) instead of raw Tailwind grays — raw grays don't re-theme in dark mode.",
        },
        {
          selector:
            "JSXAttribute[name.name='className'] Literal[value=/bg-white(?![a-zA-Z0-9/-])/]",
          message:
            "Use bg-card instead of bg-white — bg-card re-themes in dark mode and carries the warm card shadow.",
        },
        {
          selector:
            "JSXAttribute[name.name='className'] Literal[value=/\\[#[0-9a-fA-F]{3,8}\\]/]",
          message:
            "No raw hex in class names — use a token from globals.css @theme (brand, accent, surface, border, foreground, muted...). If a new color is genuinely needed, add a token first.",
        },
        {
          selector:
            "JSXAttribute[name.name='className'] Literal[value=/text-\\[[0-9.]+px\\]/]",
          message:
            "No arbitrary font sizes — use the type scale (text-2xs for micro labels, text-xs body floor, text-sm default, text-base+, headings via font-heading).",
        },
      ],
    },
  },
]);

export default eslintConfig;
