// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { CertStatusBadge } from "@/components/staff/CertStatusBadge";

function daysFromNow(n: number): Date {
  const d = new Date("2026-10-11T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

describe("CertStatusBadge", () => {
  beforeEach(() => {
    // Sydney is already 11 October while a UTC CI runner is still on the 10th.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T14:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());
  it("shows 'Not uploaded' for null", () => {
    const { container } = render(<CertStatusBadge expiryDate={null} />);
    expect(container.textContent).toContain("Not uploaded");
  });

  it.each([
    [-10, /Expired/],
    [-1, /Expired/],
    [0, /today/i],
    [1, /Expires in 1/],
    [7, /Expires in 7/],
    [14, /Expires in 14/],
    [30, /Expires in 30/],
    [31, /Valid/],
    [365, /Valid/],
  ])("days=%d → matches %s", (days, pattern) => {
    const { container } = render(<CertStatusBadge expiryDate={daysFromNow(days)} />);
    expect(container.textContent ?? "").toMatch(pattern);
  });
});
