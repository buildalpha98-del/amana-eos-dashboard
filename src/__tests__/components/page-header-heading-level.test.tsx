// @vitest-environment jsdom
/**
 * PageHeader renders the page's title, so it must be the document's <h1>.
 *
 * It emitted an <h2> until 2026-09-26, which meant the ~57 pages that adopt it
 * had no top-level heading at all and their heading outline started at level 2
 * for no reason. The risk in fixing it is the opposite failure — a page that
 * renders PageHeader *and* its own <h1> would then have two — so this guards
 * both directions.
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { readFileSync } from "fs";
import { globSync } from "glob";
import { PageHeader } from "@/components/layout/PageHeader";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/rocks",
  useSearchParams: () => new URLSearchParams(),
}));

describe("PageHeader heading level", () => {
  it("renders the title as the one and only h1", () => {
    const { container } = render(<PageHeader title="Rocks" />);
    const h1s = container.querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe("Rocks");
    expect(container.querySelectorAll("h2")).toHaveLength(0);
  });

  it("is not paired with a second h1 anywhere that uses it", () => {
    const offenders = globSync("src/app/**/*.tsx", { cwd: process.cwd() }).filter(
      (f) => {
        const src = readFileSync(f, "utf8");
        return src.includes("<PageHeader") && src.includes("<h1");
      },
    );

    expect(
      offenders,
      "PageHeader already supplies the page's h1 — these files would render a second one.",
    ).toEqual([]);
  });
});
