import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The service worker must leave cross-origin requests to the browser: when
 * it re-fetched them itself they ran under sw.js's CSP and failed, which
 * silently killed the Meta Pixel on every controlled page (2026-10-17).
 */
describe("public/sw.js", () => {
  const src = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
  it("returns early for other origins before any respondWith", () => {
    const guard = src.indexOf("url.origin !== self.location.origin) return;");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(src.indexOf("event.respondWith"));
  });
});
