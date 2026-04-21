// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

// Silence toast side-effects
vi.mock("@/hooks/useToast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

import { CertActionBar } from "@/components/compliance/CertActionBar";

const baseCert = {
  id: "cert-1",
  serviceId: "svc-1",
  userId: "user-1",
  fileUrl: "https://blob.example.com/cert-1.pdf",
  fileName: "wwcc.pdf",
  type: "wwcc",
  issueDate: new Date("2023-01-01"),
  expiryDate: new Date("2030-01-01"),
};

describe("CertActionBar", () => {
  it("renders a Download link when fileUrl is present", () => {
    const { container } = render(
      <CertActionBar cert={baseCert} canEdit={false} canDelete={false} />,
    );
    const link = container.querySelector('a[href="/api/compliance/cert-1/download"]');
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain("Download");
  });

  it("hides the Download link when fileUrl is null", () => {
    const { container } = render(
      <CertActionBar cert={{ ...baseCert, fileUrl: null }} canEdit={false} canDelete={false} />,
    );
    const link = container.querySelector('a[href="/api/compliance/cert-1/download"]');
    expect(link).toBeNull();
  });

  it("hides the Upload button when canEdit is false", () => {
    const { container } = render(
      <CertActionBar cert={baseCert} canEdit={false} canDelete={false} />,
    );
    expect(container.textContent).not.toContain("Replace");
    expect(container.textContent).not.toContain("Upload");
  });

  it("shows the Replace button when canEdit is true and a file is attached", () => {
    const { container } = render(
      <CertActionBar cert={baseCert} canEdit={true} canDelete={false} />,
    );
    // When fileUrl is set, the button label is "Replace"; otherwise "Upload"
    expect(container.textContent).toContain("Replace");
  });

  it("shows the Upload button when canEdit is true and no file is attached", () => {
    const { container } = render(
      <CertActionBar
        cert={{ ...baseCert, fileUrl: null }}
        canEdit={true}
        canDelete={false}
      />,
    );
    expect(container.textContent).toContain("Upload");
    // With no file, there is no "Replace" wording
    expect(container.textContent).not.toContain("Replace");
  });

  it("hides the Delete button when canDelete is false", () => {
    const { container } = render(
      <CertActionBar cert={baseCert} canEdit={true} canDelete={false} />,
    );
    expect(container.textContent).not.toContain("Delete");
  });

  it("shows the Delete button when canDelete is true", () => {
    const { container } = render(
      <CertActionBar cert={baseCert} canEdit={true} canDelete={true} />,
    );
    expect(container.textContent).toContain("Delete");
  });
});
