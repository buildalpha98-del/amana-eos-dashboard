// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ─── Toast mock ──────────────────────────────────────────────────
const toastSpy = vi.fn();
vi.mock("@/hooks/useToast", () => ({
  toast: (opts: unknown) => toastSpy(opts),
  useToast: () => ({ toast: toastSpy, toasts: [], dismiss: vi.fn() }),
}));

// ─── fetch-api mock ──────────────────────────────────────────────
const mutateApiSpy = vi.fn();
vi.mock("@/lib/fetch-api", () => ({
  fetchApi: vi.fn(),
  mutateApi: (...args: unknown[]) => mutateApiSpy(...args),
  ApiResponseError: class ApiResponseError extends Error {},
}));

// ─── Data-layer mock ─────────────────────────────────────────────
vi.mock("@/hooks/useWeeklyRollCall", () => ({
  useEnrollableChildren: () => ({
    data: {
      children: [
        {
          id: "c1",
          firstName: "Alice",
          surname: "A",
          photo: null,
          dob: null,
          bookingPrefs: null,
        },
      ],
    },
    isLoading: false,
    error: null,
  }),
}));

import { AddChildDialog } from "@/components/services/weekly-grid/AddChildDialog";

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const weekDates = [
  "2026-04-20",
  "2026-04-21",
  "2026-04-22",
  "2026-04-23",
  "2026-04-24",
];

describe("AddChildDialog — bulk wire-up (4b)", () => {
  beforeEach(() => {
    mutateApiSpy.mockReset();
    toastSpy.mockReset();
  });

  it("submits all selections in ONE call to /api/attendance/roll-call/bulk", async () => {
    mutateApiSpy.mockResolvedValue({ created: 2, failed: 0 });

    wrap(
      <AddChildDialog
        open
        onClose={() => {}}
        serviceId="svc1"
        weekStart="2026-04-20"
        weekDates={weekDates}
      />,
    );

    // Two selections for child c1 — Mon BSC + Tue ASC.
    fireEvent.click(screen.getByTestId("addchild-cell-c1-2026-04-20-bsc"));
    fireEvent.click(screen.getByTestId("addchild-cell-c1-2026-04-21-asc"));
    fireEvent.click(screen.getByRole("button", { name: /add 2/i }));

    await waitFor(() => expect(mutateApiSpy).toHaveBeenCalledTimes(1));

    const [url, init] = mutateApiSpy.mock.calls[0];
    expect(url).toBe("/api/attendance/roll-call/bulk");
    expect(init.method).toBe("POST");
    expect(init.body).toMatchObject({
      serviceId: "svc1",
      items: expect.arrayContaining([
        expect.objectContaining({
          childId: "c1",
          date: "2026-04-20",
          sessionType: "bsc",
          action: "undo",
        }),
        expect.objectContaining({
          childId: "c1",
          date: "2026-04-21",
          sessionType: "asc",
          action: "undo",
        }),
      ]),
    });
    expect(init.body.items).toHaveLength(2);

    // Success toast with aggregate count from the server.
    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.stringContaining("Added 2 booking"),
        }),
      );
    });
  });

  it("surfaces the server error toast when the bulk call rejects", async () => {
    mutateApiSpy.mockRejectedValue(
      new Error("Item 1 (child c1, 2026-04-20 bsc): constraint violation"),
    );

    wrap(
      <AddChildDialog
        open
        onClose={() => {}}
        serviceId="svc1"
        weekStart="2026-04-20"
        weekDates={weekDates}
      />,
    );

    fireEvent.click(screen.getByTestId("addchild-cell-c1-2026-04-20-bsc"));
    fireEvent.click(screen.getByRole("button", { name: /add 1/i }));

    await waitFor(() => expect(mutateApiSpy).toHaveBeenCalledTimes(1));

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          description: expect.stringContaining("constraint violation"),
        }),
      );
    });
  });
});
