// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PersonalTab } from "@/components/staff/tabs/PersonalTab";

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    name: "Jane",
    email: "jane@test.com",
    role: "staff",
    phone: "0400000000",
    dateOfBirth: new Date("1990-01-01"),
    addressStreet: "1 Main St",
    addressSuburb: "Fairfield",
    addressState: "VIC",
    addressPostcode: "3078",
    startDate: new Date("2023-06-01"),
    probationEndDate: null,
    ...overrides,
  } as unknown as Parameters<typeof PersonalTab>[0]["targetUser"];
}

describe("PersonalTab", () => {
  it("renders phone, address, DOB, start date", () => {
    const { container } = render(
      <PersonalTab targetUser={makeUser()} emergencyContacts={[]} canEdit={false} />,
    );
    expect(container.textContent).toContain("0400000000");
    expect(container.textContent).toContain("1 Main St");
    expect(container.textContent).toContain("Fairfield");
    expect(container.textContent).toContain("VIC");
    expect(container.textContent).toContain("3078");
  });

  it("renders emergency contacts list with Primary badge", () => {
    const contacts = [
      {
        id: "c1",
        userId: "u1",
        name: "John Doe",
        phone: "0411111111",
        relationship: "Spouse",
        isPrimary: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "c2",
        userId: "u1",
        name: "Anne Smith",
        phone: "0422222222",
        relationship: "Sister",
        isPrimary: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const { container } = render(
      <PersonalTab
        targetUser={makeUser()}
        emergencyContacts={contacts as Parameters<typeof PersonalTab>[0]["emergencyContacts"]}
        canEdit={false}
      />,
    );
    expect(container.textContent).toContain("John Doe");
    expect(container.textContent).toContain("Anne Smith");
    expect(container.textContent).toContain("Primary");
  });

  it("hides Edit button when canEdit is false", () => {
    const { container } = render(
      <PersonalTab targetUser={makeUser()} emergencyContacts={[]} canEdit={false} />,
    );
    expect(container.textContent).not.toContain("Edit");
  });

  it("shows Edit button when canEdit is true", () => {
    const { container } = render(
      <PersonalTab targetUser={makeUser()} emergencyContacts={[]} canEdit={true} />,
    );
    expect(container.textContent).toContain("Edit");
  });
});
