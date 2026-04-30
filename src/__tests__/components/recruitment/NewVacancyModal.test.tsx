// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NewVacancyModal } from "@/components/recruitment/NewVacancyModal";

vi.mock("@/components/ui/AiButton", () => ({
  AiButton: () => <div data-testid="ai-button" />,
}));

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe("NewVacancyModal services list parsing", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders without crashing on paginated { items } response", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { id: "svc1", name: "Bankstown" },
          { id: "svc2", name: "Liverpool" },
        ],
        total: 2,
        page: 1,
      }),
    }) as unknown as typeof fetch;

    render(<NewVacancyModal onClose={vi.fn()} onCreated={vi.fn()} />, {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => {
      expect(screen.getByText("Bankstown")).toBeInTheDocument();
      expect(screen.getByText("Liverpool")).toBeInTheDocument();
    });
  });

  it("renders without crashing on raw array response", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: "svc1", name: "Bankstown" }],
    }) as unknown as typeof fetch;

    render(<NewVacancyModal onClose={vi.fn()} onCreated={vi.fn()} />, {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => {
      expect(screen.getByText("Bankstown")).toBeInTheDocument();
    });
  });
});
