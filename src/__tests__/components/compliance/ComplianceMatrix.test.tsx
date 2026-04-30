// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Silence toast side-effects
vi.mock("@/hooks/useToast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

// Mock next-auth session — admin role so the viewer can edit / delete
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: { id: "admin-1", email: "admin@example.com", role: "admin", name: "Admin" },
    },
    status: "authenticated",
  }),
}));

// Import after mocks
import { ComplianceMatrix } from "@/components/compliance/ComplianceMatrix";

const matrixFixture = {
  summary: { totalStaff: 2, fullyCompliant: 0, atRisk: 1, nonCompliant: 1 },
  rows: [
    {
      userId: "user-1",
      userName: "Alice Example",
      serviceName: "Centre A",
      serviceCode: "AAA",
      validCount: 2,
      totalRequired: 3,
      certs: [
        { type: "wwcc", status: "valid", expiryDate: "2030-01-01", daysLeft: 1200 },
        { type: "first_aid", status: "expiring", expiryDate: "2026-05-01", daysLeft: 10 },
        { type: "cpr", status: "expired", expiryDate: "2025-01-01", daysLeft: -100 },
      ],
    },
    {
      userId: "user-2",
      userName: "Bob Sample",
      serviceName: "Centre B",
      serviceCode: "BBB",
      validCount: 1,
      totalRequired: 3,
      certs: [
        { type: "wwcc", status: "missing", expiryDate: null, daysLeft: null },
        { type: "first_aid", status: "valid", expiryDate: "2030-01-01", daysLeft: 1200 },
        { type: "cpr", status: "valid", expiryDate: "2030-01-01", daysLeft: 1200 },
      ],
    },
  ],
};

// An empty /api/compliance response so CertActionBar lookup stays empty.
const complianceListFixture: unknown[] = [];

function installFetchMock() {
  global.fetch = vi.fn().mockImplementation(async (url: string | URL) => {
    const u = String(url);
    if (u.includes("/api/compliance/matrix")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => matrixFixture,
      };
    }
    if (u.includes("/api/compliance")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => complianceListFixture,
      };
    }
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({}),
    };
  }) as unknown as typeof fetch;
}

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

async function flushQuery() {
  // Allow the useQuery's queryFn promise to resolve and React to render.
  // fetchApi awaits res.json(), plus React Query schedules updates, so several
  // micro-task turns are needed before the data lands.
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("ComplianceMatrix", () => {
  beforeEach(() => {
    installFetchMock();
  });

  it("renders a row per staff and a column header per cert type", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(<ComplianceMatrix />, { wrapper: makeWrapper(qc) });

    await flushQuery();
    await waitFor(() => expect(screen.queryByText("Alice Example")).toBeInTheDocument());

    // Rows: staff names appear
    expect(screen.getByText("Alice Example")).toBeInTheDocument();
    expect(screen.getByText("Bob Sample")).toBeInTheDocument();

    // Column headers: at least these three cert types
    expect(screen.getAllByRole("columnheader").some((h) => h.textContent === "WWCC")).toBe(true);
    expect(screen.getAllByRole("columnheader").some((h) => h.textContent === "First Aid")).toBe(
      true,
    );
    expect(screen.getAllByRole("columnheader").some((h) => h.textContent === "CPR")).toBe(true);

    // Service name rendered in row header
    expect(screen.getByText("Centre A")).toBeInTheDocument();
  });

  it("renders a cell per staff x cert-type combination with correct status", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { container } = render(<ComplianceMatrix />, { wrapper: makeWrapper(qc) });
    await flushQuery();
    await waitFor(() =>
      expect(container.querySelectorAll("button[data-status]").length).toBe(6),
    );

    // 2 rows x 3 cert types = 6 cells
    const cells = container.querySelectorAll("button[data-status]");
    expect(cells.length).toBe(6);

    // Alice's WWCC is valid; CPR expired
    const aliceRow = container.querySelector('[data-cell-user="user-1"][data-cell-type="wwcc"] button[data-status]');
    expect(aliceRow?.getAttribute("data-status")).toBe("valid");

    const aliceCpr = container.querySelector('[data-cell-user="user-1"][data-cell-type="cpr"] button[data-status]');
    expect(aliceCpr?.getAttribute("data-status")).toBe("expired");

    // Bob's WWCC is missing
    const bobWwcc = container.querySelector('[data-cell-user="user-2"][data-cell-type="wwcc"] button[data-status]');
    expect(bobWwcc?.getAttribute("data-status")).toBe("missing");
  });

  it("opens the detail sheet when a cell is clicked", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { container } = render(<ComplianceMatrix />, { wrapper: makeWrapper(qc) });
    await flushQuery();
    await waitFor(() =>
      expect(container.querySelectorAll("button[data-status]").length).toBe(6),
    );

    // Sheet should be closed initially
    expect(screen.queryByTestId("compliance-matrix-sheet")).toBeNull();

    // Click Alice's first_aid cell
    const cellWrapper = container.querySelector('[data-cell-user="user-1"][data-cell-type="first_aid"] button[data-status]');
    expect(cellWrapper).not.toBeNull();

    await act(async () => {
      fireEvent.click(cellWrapper as Element);
    });

    // Sheet opens with the cert type + staff name
    const sheet = screen.getByTestId("compliance-matrix-sheet");
    expect(sheet).toBeInTheDocument();
    expect(sheet.textContent).toContain("First Aid");
    expect(sheet.textContent).toContain("Alice Example");
  });

  it("shows an empty state when the API returns no rows", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/api/compliance/matrix")) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({ rows: [], summary: { totalStaff: 0, fullyCompliant: 0, atRisk: 0, nonCompliant: 0 } }),
        };
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      };
    }) as unknown as typeof fetch;

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(<ComplianceMatrix />, { wrapper: makeWrapper(qc) });
    await flushQuery();
    await waitFor(() =>
      expect(screen.queryByText(/No staff assigned to centres/i)).toBeInTheDocument(),
    );

    expect(screen.getByText(/No staff assigned to centres/i)).toBeInTheDocument();
  });
});
