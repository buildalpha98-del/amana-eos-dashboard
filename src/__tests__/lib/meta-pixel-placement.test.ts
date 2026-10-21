/**
 * Where the Meta Pixel may run (security brief batch 5, 2026-10-21).
 *
 * A third-party ad script must never load on a page holding a family's
 * records: the enrolment form (medical, family and bank details), /enrol
 * (token URLs), parent login, or anything in the dashboard. It runs on the ad
 * landing page (signup) and the enrolment thank-you page only.
 *
 * Adding a page here is a deliberate decision — check the page holds no
 * family data and its URL carries no token or record id.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ALLOWED_PAGES = ["src/app/parent/signup/page.tsx", "src/app/parent/enrol/thank-you/page.tsx"].sort();
const ALLOWED_CSP_ROUTES = ["/parent/signup", "/parent/enrol/thank-you"].sort();

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p);
  }
  return out;
}

describe("Meta Pixel placement", () => {
  it("renders only on the allowed pages", () => {
    const rendering = walk("src")
      .filter((f) => !f.includes("__tests__") && !f.endsWith("components/analytics/MetaPixel.tsx"))
      .filter((f) => /<MetaPixel\b/.test(readFileSync(f, "utf8")))
      .sort();
    expect(rendering).toEqual(ALLOWED_PAGES);
  });

  it("is CSP-allowed only on those routes", () => {
    const config = readFileSync("next.config.ts", "utf8");
    const routes = [...config.matchAll(/source:\s*"([^"]+)",\s*headers:\s*securityHeaders\(\{\s*metaPixel:\s*true\s*\}\)/g)]
      .map((m) => m[1])
      .sort();
    expect(routes).toEqual(ALLOWED_CSP_ROUTES);
  });

  it("the thank-you page only loads it after scrubbing ids from the URL", () => {
    const src = readFileSync("src/app/parent/enrol/thank-you/page.tsx", "utf8");
    expect(src).toMatch(/\{urlClean && <MetaPixel \/>\}/);
    expect(src).toMatch(/history\.replaceState/);
  });
});
