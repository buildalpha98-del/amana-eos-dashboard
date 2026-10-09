/**
 * Every deep link into a centre page (`/services/<id>?tab=…&sub=…`) must
 * name a section that exists. The centre page falls back SILENTLY to its
 * first tab for an unknown key, so a typo isn't an error — it's a button
 * that quietly opens the wrong page. Six of them shipped on the Coordinator
 * dashboard (tab=safety, tab=people, sub=medications…) before this guard
 * existed (2026-10-09).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { tabGroups, CASUAL_BOOKINGS_SUBTAB, SUB_TAB_ALIASES } from "@/lib/service-sections";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__" || name === "api" || name === "parent") continue;
      walk(p, out);
    } else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p);
  }
  return out;
}

const groups = new Map(tabGroups.map((g) => [g.key, new Set(g.subTabs.map((s) => s.key))]));
groups.get("daily")?.add(CASUAL_BOOKINGS_SUBTAB.key);
// A retired key that the page redirects still lands somewhere real.
for (const [from, to] of Object.entries(SUB_TAB_ALIASES)) {
  for (const subs of groups.values()) if (subs.has(to)) subs.add(from);
}

// A centre deep link: the 60 chars before "?tab=" mention the services route
// or a centre-URL variable.
const LINK = /\?tab=([a-z-]+)(?:&sub=([a-z-]+))?/g;

describe("centre-page deep links name real sections", () => {
  const broken: string[] = [];
  for (const file of walk(join(process.cwd(), "src"))) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(LINK)) {
      const lineStart = src.lastIndexOf("\n", m.index) + 1;
      // Comments describing old URLs aren't links.
      if (/^\s*(\/\/|\*|\/\*)/.test(src.slice(lineStart, m.index))) continue;
      const before = src.slice(Math.max(0, (m.index ?? 0) - 60), m.index);
      if (!/services\/|\$\{svc\}|\bsvc\b|serviceHref|servicePath/.test(before)) continue;
      const [, tab, sub] = m;
      const subs = groups.get(tab);
      if (!subs) broken.push(`${file.split("/src/")[1]}: tab=${tab}`);
      else if (sub && !subs.has(sub)) broken.push(`${file.split("/src/")[1]}: tab=${tab}&sub=${sub}`);
    }
  }

  it("has no link to a section that doesn't exist", () => {
    expect(broken).toEqual([]);
  });
});
