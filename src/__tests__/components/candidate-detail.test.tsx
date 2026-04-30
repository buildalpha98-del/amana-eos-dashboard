// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockToast = vi.fn();
vi.mock("@/hooks/useToast", () => ({
  toast: (...args: unknown[]) => mockToast(...args),
  useToast: () => ({ toast: mockToast, toasts: [], dismiss: vi.fn() }),
}));

vi.mock("@/lib/fetch-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/fetch-api")>(
    "@/lib/fetch-api",
  );
  return {
    ...actual,
    mutateApi: vi.fn(async () => {
      throw new Error("Network down");
    }),
  };
});

import { CandidateDetailPanel } from "@/components/recruitment/CandidateDetailPanel";

function makeCandidate(overrides: Record<string, unknown> = {}) {
  return {
    id: "c-1",
    stage: "applied",
    name: "X",
    email: null,
    phone: null,
    notes: null,
    interviewNotes: null,
    aiScreenScore: null,
    aiScreenSummary: null,
    vacancyId: "v-1",
    stageChangedAt: new Date().toISOString(),
    source: "indeed",
    appliedAt: new Date().toISOString(),
    resumeText: null,
    resumeFileUrl: null,
    referredByUserId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("CandidateDetailPanel — optimistic stage update", () => {
  beforeEach(() => {
    mockToast.mockClear();
  });

  it("reverts stage on error and surfaces a destructive toast", async () => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const candidate = makeCandidate();
    qc.setQueryData(["vacancy", "v-1"], {
      id: "v-1",
      candidates: [candidate],
    });

    render(
      <QueryClientProvider client={qc}>
        <CandidateDetailPanel
          candidateId="c-1"
          vacancyId="v-1"
          onClose={() => {}}
        />
      </QueryClientProvider>,
    );

    const select = screen.getByLabelText(/stage/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "screened" } });

    // Optimistic — immediately shows "screened"
    expect(select.value).toBe("screened");

    // Wait for error → revert
    await waitFor(() => expect(select.value).toBe("applied"));

    // Destructive toast surfaced with error message
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          description: expect.stringContaining("Network down"),
        }),
      ),
    );
  });

  it("shows candidate name + email + stage dropdown when candidate is loaded", () => {
    const qc = new QueryClient();
    const candidate = makeCandidate({
      stage: "interviewed",
      name: "Amira Candidate",
      email: "amira@t.com",
    });
    qc.setQueryData(["vacancy", "v-1"], {
      id: "v-1",
      candidates: [candidate],
    });

    render(
      <QueryClientProvider client={qc}>
        <CandidateDetailPanel
          candidateId="c-1"
          vacancyId="v-1"
          onClose={() => {}}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText("Amira Candidate")).toBeInTheDocument();
    expect(screen.getByText("amira@t.com")).toBeInTheDocument();
    const select = screen.getByLabelText(/stage/i) as HTMLSelectElement;
    expect(select.value).toBe("interviewed");
  });
});
