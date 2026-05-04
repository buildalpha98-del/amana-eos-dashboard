// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const makeTemplate = (overrides: Partial<{
  id: string;
  name: string;
  status: "active" | "disabled";
}> = {}) => ({
  id: overrides.id ?? "tpl-1",
  name: overrides.name ?? "Permanent Full-Time Educator",
  description: null,
  contentJson: { type: "doc", content: [] },
  manualFields: [],
  status: overrides.status ?? "active",
  createdById: "u-1",
  updatedById: null,
  createdAt: "2026-05-01T00:00:00Z",
  updatedAt: "2026-05-02T00:00:00Z",
  createdBy: { id: "u-1", name: "Jayden Test" },
  updatedBy: undefined,
});

vi.mock("@/hooks/useContractTemplates", () => ({
  useContractTemplates: vi.fn(),
  useCloneContractTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteContractTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateContractTemplate: () => ({ mutate: vi.fn(), isPending: false }),
}));

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

// Helper to set the useContractTemplates return value
async function mockTemplates(data: ReturnType<typeof makeTemplate>[]) {
  const { useContractTemplates } = await import("@/hooks/useContractTemplates");
  (useContractTemplates as ReturnType<typeof vi.fn>).mockReturnValue({
    data,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });
}

describe("TemplatesTable smoke", () => {
  it("renders empty state when list is empty", async () => {
    await mockTemplates([]);
    const { TemplatesTable } = await import(
      "@/components/contracts/templates/TemplatesTable"
    );
    render(wrap(<TemplatesTable onCreate={vi.fn()} />));
    expect(screen.getByText(/no templates yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create first template/i })).toBeInTheDocument();
  });

  it("renders one row when list has one item", async () => {
    await mockTemplates([makeTemplate({ name: "Casual Educator Contract" })]);
    const { TemplatesTable } = await import(
      "@/components/contracts/templates/TemplatesTable"
    );
    render(wrap(<TemplatesTable onCreate={vi.fn()} />));
    expect(screen.getByRole("button", { name: /casual educator contract/i })).toBeInTheDocument();
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
  });
});
