// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ComplianceTab } from "@/components/staff/tabs/ComplianceTab";

function makeQual(overrides: Record<string, unknown> = {}) {
  return {
    id: "q1",
    userId: "u1",
    type: "first_aid",
    name: "HLTAID011 First Aid",
    institution: "Allens Training",
    completedDate: new Date("2024-01-01"),
    expiryDate: new Date("2030-01-01"),
    certificateUrl: "https://example.com/q1.pdf",
    verified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as Parameters<typeof ComplianceTab>[0]["qualifications"][number];
}

function makeCert(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    serviceId: "svc-1",
    userId: "u1",
    type: "working_with_children",
    label: "WWCC VIC",
    issueDate: new Date("2023-01-01"),
    expiryDate: new Date("2030-01-01"),
    notes: null,
    fileUrl: "https://example.com/c1.pdf",
    fileName: "wwcc.pdf",
    alertDays: 30,
    acknowledged: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as Parameters<typeof ComplianceTab>[0]["certificates"][number];
}

describe("ComplianceTab", () => {
  it("shows empty messages when nothing uploaded", () => {
    const { container } = render(
      <ComplianceTab qualifications={[]} certificates={[]} canManage={false} />,
    );
    expect(container.textContent).toContain("No qualifications recorded");
    expect(container.textContent).toContain("No certificates uploaded");
  });

  it("renders qualifications with name, institution, expiry, download link", () => {
    const { container } = render(
      <ComplianceTab
        qualifications={[makeQual()]}
        certificates={[]}
        canManage={false}
      />,
    );
    expect(container.textContent).toContain("HLTAID011 First Aid");
    expect(container.textContent).toContain("Allens Training");
    const download = container.querySelector('a[href="https://example.com/q1.pdf"]');
    expect(download).not.toBeNull();
  });

  it("renders certificates with label and expiry", () => {
    const { container } = render(
      <ComplianceTab
        qualifications={[]}
        certificates={[makeCert()]}
        canManage={false}
      />,
    );
    expect(container.textContent).toContain("WWCC VIC");
    // Download link now routes through the access-checked download route
    const download = container.querySelector('a[href="/api/compliance/c1/download"]');
    expect(download).not.toBeNull();
  });

  it("hides the Add qualification button when canManage is false", () => {
    const { container } = render(
      <ComplianceTab qualifications={[]} certificates={[]} canManage={false} />,
    );
    expect(container.textContent).not.toContain("Add qualification");
  });

  it("shows the Add qualification button when canManage is true", () => {
    const { container } = render(
      <ComplianceTab qualifications={[]} certificates={[]} canManage={true} />,
    );
    expect(container.textContent).toContain("Add qualification");
  });

  it("hides Replace/Delete actions on cert cards when canManage is false", () => {
    const { container } = render(
      <ComplianceTab
        qualifications={[]}
        certificates={[makeCert()]}
        canManage={false}
      />,
    );
    expect(container.textContent).not.toContain("Replace");
    expect(container.textContent).not.toContain("Delete");
  });

  it("shows Replace/Delete actions on cert cards when canManage is true", () => {
    const { container } = render(
      <ComplianceTab
        qualifications={[]}
        certificates={[makeCert()]}
        canManage={true}
      />,
    );
    expect(container.textContent).toContain("Replace");
    expect(container.textContent).toContain("Delete");
  });
});
