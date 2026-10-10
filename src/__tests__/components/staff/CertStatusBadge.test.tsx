// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { CertStatusBadge } from "@/components/staff/CertStatusBadge";

function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * 86_400_000);
}

describe("CertStatusBadge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Stable centre-calendar fixtures on both UTC CI and Sydney workstations.
    vi.setSystemTime(new Date("2026-05-04T10:00:00Z"));
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
