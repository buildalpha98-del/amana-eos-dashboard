// @vitest-environment jsdom
/**
 * Regression: a certificate whose `service` relation is null (personal cert —
 * serviceId was relaxed to nullable on 2026-06-05) crashed the ENTIRE
 * /compliance page with "Cannot read properties of null (reading 'name')"
 * because AdminComplianceView rendered `cert.service.name` unguarded.
 * Observed against production data on 2026-07-12.
 */
import React from "react";
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
    data: { user: { id: "u-admin", role: "owner", name: "Owner" } },
    status: "authenticated",
  }),
}));

// Heavy sibling tabs — not under test.
vi.mock("@/components/compliance/ComplianceMatrixView", () => ({
  default: () => <div data-testid="matrix-view" />,
}));
vi.mock("@/components/compliance/ComplianceMatrix", () => ({
  ComplianceMatrix: () => <div data-testid="matrix" />,
}));
vi.mock("@/components/compliance/AuditCalendarTab", () => ({
  AuditCalendarTab: () => <div data-testid="audit-calendar" />,
}));
vi.mock("@/components/compliance/AuditResultsTab", () => ({
  AuditResultsTab: () => <div data-testid="audit-results" />,
}));
vi.mock("@/components/compliance/QualificationRatiosTab", () => ({
  QualificationRatiosTab: () => <div data-testid="qual-ratios" />,
}));
vi.mock("@/components/import/ImportWizard", () => ({
  ImportWizard: () => <div data-testid="import-wizard" />,
}));

const futureExpiry = new Date(Date.now() + 90 * 86400000).toISOString();

const mkCert = (overrides: Record<string, unknown>) => ({
  id: "cert-1",
  userId: "u-staff",
  user: { id: "u-staff", name: "Amira Staff" },
  serviceId: "svc-1",
  service: { id: "svc-1", name: "Mawson Lakes", code: "ML" },
  type: "wwcc",
  label: null,
  number: "WWC123",
  expiryDate: futureExpiry,
  fileUrl: null,
  acknowledged: false,
  createdAt: new Date().toISOString(),
  ...overrides,
});

vi.mock("@/hooks/useCompliance", () => ({
  useComplianceCerts: () => ({
    data: [
      mkCert({ id: "cert-1" }),
      // The crash fixture: personal cert, no centre.
      mkCert({
        id: "cert-2",
        userId: "u-nohome",
        user: { id: "u-nohome", name: "Bilal NoCentre" },
        serviceId: null,
        service: null,
      }),
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useCreateCert: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useUpdateCert: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDeleteCert: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

import CompliancePage from "@/app/(dashboard)/compliance/page";

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("/compliance with a null-service certificate", () => {
  it("renders every cert row instead of crashing the page", async () => {
    // The services/users lists load via raw fetch — empty is fine here.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as unknown as typeof fetch;

    render(<CompliancePage />, { wrapper: Wrapper });

    // Both rows render — including the personal cert with no centre.
    expect(await screen.findByText("Amira Staff")).toBeInTheDocument();
    expect(screen.getByText("Bilal NoCentre")).toBeInTheDocument();
    expect(screen.getByText(/Mawson Lakes/)).toBeInTheDocument();
    expect(screen.getByText("Personal — no centre")).toBeInTheDocument();
    // And the error boundary fallback is nowhere in sight.
    expect(screen.queryByText(/Something went wrong/i)).toBeNull();
  });
});
