import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import nextConfig from "../../../next.config";

/**
 * The Meta pixel covers the family ad funnel end to end (17 Oct 2026) —
 * signup, login, the whole enrolment form and its thank-you page — and
 * NOTHING that carries a token in its URL or belongs to staff.
 */
type Entry = { source: string; headers: { key: string; value: string }[] };

async function pixelSources(): Promise<string[]> {
  const entries = (await nextConfig.headers!()) as Entry[];
  return entries
    .filter((e) =>
      e.headers.some((h) => h.key === "Content-Security-Policy" && h.value.includes("connect.facebook.net")),
    )
    .map((e) => e.source);
}

describe("Meta pixel routes", () => {
  it("allows the pixel on the family funnel pages", async () => {
    const sources = await pixelSources();
    for (const s of ["/enrol/:path*", "/parent/signup", "/parent/login", "/parent/enrol/:path*"]) {
      expect(sources).toContain(s);
    }
  });

  it("never allows it on token pages or the catch-all", async () => {
    const sources = await pixelSources();
    for (const s of ["/(.*)", "/parent/login/confirm", "/parent/reset-password", "/parent/:path*"]) {
      expect(sources).not.toContain(s);
    }
  });

  it("lets Meta's Event Setup Tool script load on pixel pages only", async () => {
    const entries = (await nextConfig.headers!()) as Entry[];
    const csp = (src: string) =>
      entries.filter((e) => e.source === src).flatMap((e) => e.headers).find((h) => h.key === "Content-Security-Policy")!.value;
    const scriptSrc = (v: string) => v.split(";").find((d) => d.trim().startsWith("script-src"))!;
    expect(scriptSrc(csp("/parent/signup"))).toContain("https://www.facebook.com");
    expect(scriptSrc(csp("/(.*)"))).not.toContain("facebook");
  });

  it("turns off Meta's automatic form/button collection", () => {
    const src = readFileSync(join(process.cwd(), "src/components/analytics/MetaPixel.tsx"), "utf8");
    const set = src.indexOf("fbq('set', 'autoConfig', false");
    expect(set).toBeGreaterThan(-1);
    expect(set).toBeLessThan(src.indexOf("fbq('init'"));
  });
});
