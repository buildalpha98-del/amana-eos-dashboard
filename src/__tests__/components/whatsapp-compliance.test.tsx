// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "akram", role: "marketing" } }, status: "authenticated" }),
}));

vi.mock("@/hooks/useToast", () => ({
  toast: vi.fn(),
}));

import { QuickEntryPanel } from "@/components/whatsapp-compliance/QuickEntryPanel";
import { TwoWeekConcernsPanel } from "@/components/whatsapp-compliance/TwoWeekConcernsPanel";
import type { GridResponse } from "@/hooks/useWhatsAppCompliance";

function wrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function makeGrid(overrides: Partial<GridResponse> = {}): GridResponse {
  return {
    week: { start: "2026-04-20", end: "2026-04-26", weekNumber: 17, year: 2026 },
    centres: [
      { id: "svc-1", name: "Centre A", state: "NSW", code: "AAA", coordinatorName: "Sara", coordinatorUserId: "u-1" },
      { id: "svc-2", name: "Centre B", state: "VIC", code: "BBB", coordinatorName: "Lina", coordinatorUserId: "u-2" },
    ],
    days: [
      { date: "2026-04-20", dayLabel: "Mon" },
      { date: "2026-04-21", dayLabel: "Tue" },
      { date: "2026-04-22", dayLabel: "Wed" },
      { date: "2026-04-23", dayLabel: "Thu" },
      { date: "2026-04-24", dayLabel: "Fri" },
    ],
    cells: [],
    summary: { totalCells: 10, cellsChecked: 0, posted: 0, notPosted: 0, coverage: 0, target: 50, floor: 35, coordinatorWeeklyFloor: 4 },
    networkPosts: {
      engagement: { count: 0, target: 3, floor: 2, posts: [] },
      announcements: { count: 0, target: 2, floor: 2, posts: [] },
    },
    patterns: { twoWeekConcerns: [] },
    ...overrides,
  };
}

describe("QuickEntryPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders all centres with checkboxes and respects unchecked state", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ saved: 2 }),
    }) as unknown as typeof fetch;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<QuickEntryPanel grid={makeGrid()} />, { wrapper: wrapper(qc) });

    expect(screen.getByText("Centre A")).toBeTruthy();
    expect(screen.getByText("Centre B")).toBeTruthy();
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0].checked).toBe(false);
  });

  it("submits a quick-entry payload when Save is clicked", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ saved: 2 }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<QuickEntryPanel grid={makeGrid()} />, { wrapper: wrapper(qc) });

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);

    const saveBtn = screen.getByRole("button", { name: /save check-in/i });
    fireEvent.click(saveBtn);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe("/api/marketing/whatsapp/quick-entry");
    expect(call[1].method).toBe("POST");
    const body = JSON.parse(call[1].body as string);
    expect(body.entries).toHaveLength(2);
    expect(body.entries[0].posted).toBe(true);
  });
});

describe("TwoWeekConcernsPanel", () => {
  it("renders empty-state copy when no concerns", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <TwoWeekConcernsPanel concerns={[]} onViewHistory={() => {}} onAddToOneOnOne={() => {}} />,
      { wrapper: wrapper(qc) },
    );
    expect(screen.getByText(/No coordinator patterns flagged/i)).toBeTruthy();
  });

  it("renders concerns and triggers callbacks", () => {
    const onView = vi.fn();
    const onAdd = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <TwoWeekConcernsPanel
        concerns={[
          {
            serviceId: "svc-1",
            serviceName: "Centre A",
            coordinatorName: "Sara",
            coordinatorUserId: "u-1",
            lastWeekPosted: 3,
            thisWeekPosted: 2,
            reason: "two_consecutive_below_floor",
          },
        ]}
        onViewHistory={onView}
        onAddToOneOnOne={onAdd}
      />,
      { wrapper: wrapper(qc) },
    );

    expect(screen.getByText(/Sara \(Centre A\)/)).toBeTruthy();
    expect(screen.getByText(/2\/5/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /view 8-week history/i }));
    expect(onView).toHaveBeenCalledWith("svc-1");

    fireEvent.click(screen.getByRole("button", { name: /add to 1:1/i }));
    expect(onAdd).toHaveBeenCalled();
  });
});
