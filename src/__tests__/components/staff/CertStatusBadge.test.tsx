// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CertStatusBadge } from "@/components/staff/CertStatusBadge";

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

describe("CertStatusBadge", () => {
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
