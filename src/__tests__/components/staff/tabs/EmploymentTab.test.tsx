// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { EmploymentTab } from "@/components/staff/tabs/EmploymentTab";

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    name: "Jane",
    role: "staff",
    employmentType: "full_time",
    startDate: new Date("2023-06-01"),
    service: { id: "svc-1", name: "Amana Centre" },
    ...overrides,
  } as unknown as Parameters<typeof EmploymentTab>[0]["targetUser"];
}

function makeContract(overrides: Record<string, unknown> = {}) {
  return {
    id: "con-1",
    userId: "u1",
    contractType: "permanent",
    awardLevel: "level_3_1",
    awardLevelCustom: null,
    payRate: 32.5,
    hoursPerWeek: 38,
    startDate: new Date("2023-06-01"),
    endDate: null,
    status: "contract_active",
    documentUrl: null,
    documentId: null,
    signedAt: null,
    acknowledgedByStaff: true,
    acknowledgedAt: new Date(),
    notes: null,
    previousContractId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as NonNullable<Parameters<typeof EmploymentTab>[0]["latestContract"]>;
}

describe("EmploymentTab", () => {
  it("renders role, service name, and start date", () => {
    const { container } = render(
      <EmploymentTab targetUser={makeUser()} latestContract={null} canEdit={false} />,
    );
    expect(container.textContent).toContain("Amana Centre");
    expect(container.textContent).toContain("Educator");
    expect(container.textContent).toContain("No contract on file");
  });

  it("renders contract details with pay rate and hours", () => {
    const { container } = render(
      <EmploymentTab
        targetUser={makeUser()}
        latestContract={makeContract()}
        canEdit={false}
      />,
    );
    expect(container.textContent).toContain("$32.50");
    expect(container.textContent).toContain("38 hrs/wk");
    expect(container.textContent).toContain("Permanent");
  });

  it("renders View in Contracts link when contract present", () => {
    const { container } = render(
      <EmploymentTab
        targetUser={makeUser()}
        latestContract={makeContract()}
        canEdit={false}
      />,
    );
    const link = container.querySelector('a[href="/contracts/con-1"]');
    expect(link).not.toBeNull();
  });

  it("shows Edit button only when canEdit", () => {
    const { container: a } = render(
      <EmploymentTab targetUser={makeUser()} latestContract={null} canEdit={false} />,
    );
    expect(a.textContent).not.toContain("Edit");

    const { container: b } = render(
      <EmploymentTab targetUser={makeUser()} latestContract={null} canEdit={true} />,
    );
    expect(b.textContent).toContain("Edit");
  });
});
