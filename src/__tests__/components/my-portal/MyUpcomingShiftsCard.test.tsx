// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { MyUpcomingShiftsCard } from "@/components/my-portal/MyUpcomingShiftsCard";

function mockFetchShifts(
  shifts: Array<Record<string, unknown>>,
  opts: { ok?: boolean } = {},
) {
  const ok = opts.ok !== false;
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("/api/roster/shifts/mine")) {
      return Promise.resolve({
        ok,
        status: ok ? 200 : 500,
        headers: {
          get: (h: string) =>
            h === "content-type" ? "application/json" : null,
        },
        json: async () => (ok ? { shifts } : { error: "Server error" }),
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({}),
    });
  }) as unknown as typeof fetch;
}

function renderCard(userId = "user-1") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MyUpcomingShiftsCard userId={userId} />
    </QueryClientProvider>,
  );
}

describe("MyUpcomingShiftsCard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the card heading", async () => {
    mockFetchShifts([]);
    renderCard();
    expect(await screen.findByText(/My Upcoming Shifts/i)).toBeTruthy();
  });

  it("shows the empty state when there are no shifts", async () => {
    mockFetchShifts([]);
    const { container } = renderCard();
    await waitFor(() => {
      expect(container.textContent).toMatch(/No upcoming shifts rostered/i);
    });
  });

  it("renders shifts returned by the query", async () => {
    mockFetchShifts([
      {
        id: "sh-1",
        userId: "user-1",
        staffName: "Jane Doe",
        date: new Date("2026-04-22").toISOString(),
        sessionType: "bsc",
        shiftStart: "07:00",
        shiftEnd: "09:00",
        role: "educator",
        status: "published",
        service: { id: "svc-1", name: "Amana OSHC" },
      },
      {
        id: "sh-2",
        userId: "user-1",
        staffName: "Jane Doe",
        date: new Date("2026-04-23").toISOString(),
        sessionType: "asc",
        shiftStart: "15:00",
        shiftEnd: "18:00",
        role: null,
        status: "published",
        service: { id: "svc-1", name: "Amana OSHC" },
      },
    ]);
    renderCard("user-1");

    const first = await screen.findByTestId("my-shift-sh-1");
    const second = await screen.findByTestId("my-shift-sh-2");
    expect(first.textContent).toContain("07:00");
    expect(first.textContent).toContain("09:00");
    expect(second.textContent).toContain("15:00");
    expect(second.textContent).toContain("18:00");
  });
});
