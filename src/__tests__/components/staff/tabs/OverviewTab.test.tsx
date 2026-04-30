// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { OverviewTab } from "@/components/staff/tabs/OverviewTab";

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    name: "Jane Doe",
    email: "jane@test.com",
    role: "staff" as const,
    avatar: null,
    active: true,
    startDate: new Date("2023-06-01"),
    service: { id: "svc-1", name: "Amana Centre" } as unknown as {
      id: string;
      name: string;
    },
    ...overrides,
  } as Parameters<typeof OverviewTab>[0]["targetUser"];
}

describe("OverviewTab", () => {
  it("renders staff name, role, service, and email", () => {
    const { container } = render(
      <OverviewTab
        targetUser={makeUser()}
        stats={{
          activeRocks: 3,
          openTodos: 5,
          annualLeaveRemaining: 10,
          validCertCount: 2,
          expiringCertCount: 0,
        }}
        nextShift={null}
      />,
    );
    expect(container.textContent).toContain("Jane Doe");
    expect(container.textContent).toContain("jane@test.com");
    expect(container.textContent).toContain("Amana Centre");
    expect(container.textContent).toContain("Staff");
  });

  it("renders all stat labels", () => {
    const { container } = render(
      <OverviewTab
        targetUser={makeUser()}
        stats={{
          activeRocks: 3,
          openTodos: 5,
          annualLeaveRemaining: 10,
          validCertCount: 2,
          expiringCertCount: 1,
        }}
        nextShift={null}
      />,
    );
    expect(container.textContent).toContain("Active rocks");
    expect(container.textContent).toContain("Open todos");
    expect(container.textContent).toContain("Annual leave left");
    expect(container.textContent).toContain("Valid certs");
    expect(container.textContent).toContain("Next shift");
    expect(container.textContent).toContain("1 expiring");
  });

  it("shows Deactivated badge when user is inactive", () => {
    const { container } = render(
      <OverviewTab
        targetUser={makeUser({ active: false })}
        stats={{
          activeRocks: 0,
          openTodos: 0,
          annualLeaveRemaining: null,
          validCertCount: 0,
          expiringCertCount: 0,
        }}
        nextShift={null}
      />,
    );
    expect(container.textContent).toContain("Deactivated");
  });

  it("renders em-dash for missing annual leave balance", () => {
    const { container } = render(
      <OverviewTab
        targetUser={makeUser()}
        stats={{
          activeRocks: 0,
          openTodos: 0,
          annualLeaveRemaining: null,
          validCertCount: 0,
          expiringCertCount: 0,
        }}
        nextShift={null}
      />,
    );
    expect(container.textContent).toContain("—");
  });
});
