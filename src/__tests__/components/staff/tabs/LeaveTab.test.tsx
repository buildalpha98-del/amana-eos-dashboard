// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { LeaveTab } from "@/components/staff/tabs/LeaveTab";

function makeBalance(leaveType: "annual" | "personal" | "long_service", balance = 10) {
  return {
    id: `b-${leaveType}`,
    userId: "u1",
    leaveType,
    balance,
    accrued: 15,
    taken: 15 - balance,
    pending: 0,
    asOfDate: new Date(),
    source: "manual",
    xeroSyncedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Parameters<typeof LeaveTab>[0]["balances"][number];
}

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "r1",
    userId: "u1",
    leaveType: "annual",
    startDate: new Date("2026-05-01"),
    endDate: new Date("2026-05-05"),
    totalDays: 5,
    isHalfDay: false,
    reason: "Holiday",
    status: "leave_approved",
    reviewedById: null,
    reviewedAt: null,
    reviewNotes: null,
    serviceId: "svc-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as Parameters<typeof LeaveTab>[0]["recentRequests"][number];
}

describe("LeaveTab", () => {
  it("renders 3 balance cards (annual, personal, long_service)", () => {
    const { container } = render(
      <LeaveTab
        targetUserId="u1"
        balances={[
          makeBalance("annual", 10),
          makeBalance("personal", 5),
          makeBalance("long_service", 2),
        ]}
        recentRequests={[]}
        canRequest={false}
      />,
    );
    expect(container.textContent).toContain("Annual leave");
    expect(container.textContent).toContain("Personal leave");
    expect(container.textContent).toContain("Long service");
  });

  it("shows empty message when no leave requests", () => {
    const { container } = render(
      <LeaveTab
        targetUserId="u1"
        balances={[]}
        recentRequests={[]}
        canRequest={false}
      />,
    );
    expect(container.textContent).toContain("No leave requests");
  });

  it("renders recent leave requests with humanized status", () => {
    const { container } = render(
      <LeaveTab
        targetUserId="u1"
        balances={[]}
        recentRequests={[makeRequest()]}
        canRequest={false}
      />,
    );
    expect(container.textContent).toContain("Annual");
    expect(container.textContent).toContain("Approved");
    expect(container.textContent).toContain("5");
  });

  it("shows New request link only when canRequest is true", () => {
    const { container: a } = render(
      <LeaveTab
        targetUserId="u1"
        balances={[]}
        recentRequests={[]}
        canRequest={false}
      />,
    );
    expect(a.textContent).not.toContain("New request");

    const { container: b } = render(
      <LeaveTab
        targetUserId="u1"
        balances={[]}
        recentRequests={[]}
        canRequest={true}
      />,
    );
    expect(b.textContent).toContain("New request");
  });

  it("renders View all link with userId filter", () => {
    const { container } = render(
      <LeaveTab
        targetUserId="u1"
        balances={[]}
        recentRequests={[]}
        canRequest={false}
      />,
    );
    const link = container.querySelector('a[href="/leave?userId=u1"]');
    expect(link).not.toBeNull();
  });
});
