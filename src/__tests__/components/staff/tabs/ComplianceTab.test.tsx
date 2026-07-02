// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { ComplianceTab } from "@/components/staff/tabs/ComplianceTab";

// PdLogSection (rendered inside ComplianceTab) uses React Query hooks; mock
// them out so this test stays focused on qualification + certificate rendering.
vi.mock("@/hooks/usePdRecords", () => ({
  usePdRecords: () => ({ data: [], isLoading: false }),
  useCreatePdRecord: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePdRecord: () => ({ mutate: vi.fn(), isPending: false }),
}));

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
      <ComplianceTab userId="u-test" qualifications={[]} certificates={[]} canManage={false} isSelf={false} />,
    );
    expect(container.textContent).toContain("No qualifications recorded");
    expect(container.textContent).toContain("No certificates uploaded");
  });

  it("renders qualifications with name, institution, expiry, and a View affordance", () => {
    const { container } = render(
      <ComplianceTab userId="u-test" qualifications={[makeQual()]}
        certificates={[]}
        canManage={false}
            isSelf={false}
      />,
    );
    expect(container.textContent).toContain("HLTAID011 First Aid");
    expect(container.textContent).toContain("Allens Training");
    // View is now a button that opens the inline FileViewerModal — the raw
    // blob URL anchor was replaced. Check for the data-testid the button
    // sets and the name-as-button affordance.
    const viewButton = container.querySelector('[data-testid="qualification-view-button"]');
    expect(viewButton).not.toBeNull();
    const nameButton = container.querySelector('[data-testid="qualification-name-button"]');
    expect(nameButton).not.toBeNull();
  });

  it("renders certificates with label and a View affordance (via CertActionBar)", () => {
    const { container } = render(
      <ComplianceTab userId="u-test" qualifications={[]}
        certificates={[makeCert()]}
        canManage={false}
            isSelf={false}
      />,
    );
    expect(container.textContent).toContain("WWCC VIC");
    // CertActionBar's View opens the inline FileViewerModal via a button.
    // The download anchor lives inside the modal and is only in the DOM
    // when the modal is open, so we only assert on the trigger button here.
    expect(
      container.querySelector('[data-testid="cert-view-button"]'),
    ).not.toBeNull();
  });

  it("hides the Add qualification button when canManage is false", () => {
    const { container } = render(
      <ComplianceTab userId="u-test" qualifications={[]} certificates={[]} canManage={false} isSelf={false} />,
    );
    expect(container.textContent).not.toContain("Add qualification");
  });

  it("shows the Add qualification button when canManage is true", () => {
    const { container } = render(
      <ComplianceTab userId="u-test" qualifications={[]} certificates={[]} canManage={true} isSelf={false} />,
    );
    expect(container.textContent).toContain("Add qualification");
  });

  it("hides Replace/Delete actions on cert cards when canManage is false", () => {
    const { container } = render(
      <ComplianceTab userId="u-test" qualifications={[]}
        certificates={[makeCert()]}
        canManage={false}
            isSelf={false}
      />,
    );
    expect(container.textContent).not.toContain("Replace");
    expect(container.textContent).not.toContain("Delete");
  });

  it("shows Replace/Delete actions on cert cards when canManage is true", () => {
    const { container } = render(
      <ComplianceTab userId="u-test" qualifications={[]}
        certificates={[makeCert()]}
        canManage={true}
            isSelf={false}
      />,
    );
    expect(container.textContent).toContain("Replace");
    expect(container.textContent).toContain("Delete");
  });
});
