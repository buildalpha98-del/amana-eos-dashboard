// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

// DocumentsTab calls useRouter() for router.refresh() after a new
// upload; under jsdom there's no AppRouterProvider so we stub it.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }),
}));

import { DocumentsTab } from "@/components/staff/tabs/DocumentsTab";

function makeDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: "d1",
    title: "Employment Agreement",
    description: null,
    category: "hr",
    fileName: "agreement.pdf",
    fileUrl: "https://example.com/d1.pdf",
    fileSize: 120_000,
    mimeType: "application/pdf",
    centreId: null,
    uploadedById: "u1",
    version: 1,
    tags: [],
    folderId: null,
    deleted: false,
    indexed: false,
    indexedAt: null,
    indexError: null,
    createdAt: new Date("2026-01-15"),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as Parameters<typeof DocumentsTab>[0]["documents"][number];
}

describe("DocumentsTab", () => {
  it("renders empty state when no documents", () => {
    const { container } = render(<DocumentsTab documents={[]} />);
    expect(container.textContent).toContain("No documents uploaded");
  });

  it("renders document list with title, category, and a View affordance", () => {
    const { container } = render(<DocumentsTab documents={[makeDoc()]} />);
    expect(container.textContent).toContain("Employment Agreement");
    expect(container.textContent).toContain("Hr");
    // The raw blob anchor was replaced by a button that opens the inline
    // FileViewerModal. The title is itself a clickable affordance too — both
    // have testids set by the component.
    expect(
      container.querySelector('[data-testid="document-view-button"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="document-title-button"]'),
    ).not.toBeNull();
  });

  it("renders multiple documents", () => {
    const { container } = render(
      <DocumentsTab
        documents={[
          makeDoc({ id: "d1", title: "Doc One" }),
          makeDoc({ id: "d2", title: "Doc Two" }),
        ]}
      />,
    );
    expect(container.textContent).toContain("Doc One");
    expect(container.textContent).toContain("Doc Two");
  });
});
