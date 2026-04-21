// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { LeaveBalanceCard } from "@/components/staff/LeaveBalanceCard";

describe("LeaveBalanceCard", () => {
  it("renders accrued, taken, remaining", () => {
    const { container } = render(
      <LeaveBalanceCard balance={{ accrued: 20, taken: 5, remaining: 15 }} type="annual" />,
    );
    expect(container.textContent).toContain("20");
    expect(container.textContent).toContain("5");
    expect(container.textContent).toContain("15");
    expect(container.textContent).toMatch(/annual/i);
  });

  it("handles zero accrued without divide-by-zero", () => {
    const { container } = render(
      <LeaveBalanceCard balance={{ accrued: 0, taken: 0, remaining: 0 }} type="personal" />,
    );
    expect(container.textContent ?? "").not.toContain("NaN");
  });
});
