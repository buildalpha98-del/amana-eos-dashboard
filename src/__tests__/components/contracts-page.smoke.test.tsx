// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "u-1", role: "owner" } },
    status: "authenticated",
  }),
}));

vi.mock("@/hooks/useContracts", () => ({
  useContracts: () => ({
    data: [
      {
        id: "c-1",
        userId: "u-staff-1",
        user: { id: "u-staff-1", name: "Amira Test", email: "amira@test.com", avatar: null },
        contractType: "ct_permanent", awardLevel: "es2", awardLevelCustom: null,
        payRate: 35.5, hoursPerWeek: 38,
        startDate: "2026-01-15", endDate: null, status: "active",
        documentUrl: null, documentId: null, signedAt: null,
        acknowledgedByStaff: true, acknowledgedAt: "2026-01-20T00:00:00Z",
        notes: null, previousContractId: null,
        createdAt: "2026-01-15T00:00:00Z", updatedAt: "2026-01-20T00:00:00Z",
      },
      {
        id: "c-2",
        userId: "u-staff-2",
        user: { id: "u-staff-2", name: "Bilal Test", email: "bilal@test.com", avatar: null },
        contractType: "ct_casual", awardLevel: null, awardLevelCustom: null,
        payRate: 32.0, hoursPerWeek: null,
        startDate: "2026-03-01", endDate: null, status: "contract_draft",
        documentUrl: null, documentId: null, signedAt: null,
        acknowledgedByStaff: false, acknowledgedAt: null,
        notes: null, previousContractId: null,
        createdAt: "2026-03-01T00:00:00Z", updatedAt: "2026-03-01T00:00:00Z",
      },
    ],
    isLoading: false, error: null,
  }),
  useContract: () => ({ data: null, isLoading: false, error: null }),
  useCreateContract: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useUpdateContract: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useSupersedeContract: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useTerminateContract: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useAcknowledgeContract: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/components/contracts/templates/TemplatesTable", () => ({
  TemplatesTable: ({ onCreate }: { onCreate?: () => void }) =>
    <div data-testid="templates-table"><button onClick={onCreate}>stub-templates-table</button></div>,
}));

vi.mock("@/components/contracts/templates/NewTemplateModal", () => ({
  NewTemplateModal: ({ onClose }: { onClose: () => void }) =>
    <div data-testid="new-template-modal"><button onClick={onClose}>stub-new-template-modal</button></div>,
}));

vi.mock("@/hooks/useContractTemplates", () => ({
  useContractTemplates: () => ({ data: [], isLoading: false, error: null }),
  useCreateContractTemplate: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useUpdateContractTemplate: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useCloneContractTemplate: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDeleteContractTemplate: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQuery: vi.fn(() => ({
      data: [
        { id: "u-staff-1", name: "Amira Test", email: "amira@test.com", role: "staff" },
        { id: "u-staff-2", name: "Bilal Test", email: "bilal@test.com", role: "staff" },
      ],
      isLoading: false, error: null,
    })),
  };
});

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("contracts page smoke", () => {
  it("renders issued contracts tab with two mocked contracts (default tab)", async () => {
    const { default: ContractsPage } = await import("@/app/(dashboard)/contracts/page");
    render(wrap(<ContractsPage />));
    // Names render twice (mobile + desktop layouts), so use getAllByText
    expect(screen.getAllByText("Amira Test").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Bilal Test").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Draft").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /new contract/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  it("renders both tab buttons for admin user", async () => {
    const { default: ContractsPage } = await import("@/app/(dashboard)/contracts/page");
    render(wrap(<ContractsPage />));
    expect(screen.getByRole("button", { name: /issued contracts/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /templates/i })).toBeInTheDocument();
  });
});
