// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ContractsTab } from "@/components/staff/tabs/ContractsTab";

vi.mock("@/hooks/useContracts", () => ({
  useContracts: () => ({
    data: [
      {
        id: "c-1",
        userId: "u-1",
        user: { id: "u-1", name: "Amira Test", email: "amira@test.com", avatar: null },
        contractType: "ct_permanent",
        awardLevel: "es2",
        awardLevelCustom: null,
        payRate: 35.5,
        hoursPerWeek: 38,
        startDate: "2026-01-15",
        endDate: null,
        status: "active",
        documentUrl: null,
        documentId: null,
        signedAt: null,
        acknowledgedByStaff: true,
        acknowledgedAt: "2026-01-20T00:00:00Z",
        notes: null,
        previousContractId: null,
        createdAt: "2026-01-15T00:00:00Z",
        updatedAt: "2026-01-20T00:00:00Z",
      },
      {
        id: "c-0",
        userId: "u-1",
        user: { id: "u-1", name: "Amira Test", email: "amira@test.com", avatar: null },
        contractType: "ct_casual",
        awardLevel: null,
        awardLevelCustom: null,
        payRate: 30.0,
        hoursPerWeek: null,
        startDate: "2025-06-01",
        endDate: "2025-12-31",
        status: "superseded",
        documentUrl: null,
        documentId: null,
        signedAt: null,
        acknowledgedByStaff: true,
        acknowledgedAt: "2025-06-05T00:00:00Z",
        notes: null,
        previousContractId: null,
        createdAt: "2025-06-01T00:00:00Z",
        updatedAt: "2025-12-31T00:00:00Z",
      },
    ],
    isLoading: false,
    error: null,
  }),
}));

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("ContractsTab", () => {
  it("renders contracts for the staffer, newest-first", () => {
    render(wrap(<ContractsTab userId="u-1" canEdit={true} />));
    // Contract type labels render
    expect(screen.getByText(/Permanent/i)).toBeInTheDocument();
    expect(screen.getByText(/Casual/i)).toBeInTheDocument();
    // Status badges render
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Superseded")).toBeInTheDocument();
  });
});
