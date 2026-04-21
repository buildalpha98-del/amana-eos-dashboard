// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ShiftSwapDialog } from "@/components/roster/ShiftSwapDialog";

vi.mock("@/hooks/useToast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

const baseShift = {
  id: "shift-42",
  serviceId: "svc-1",
  date: "2026-04-22",
  shiftStart: "07:00",
  shiftEnd: "09:00",
};

function installFetchMock(
  capture: { calls: Array<{ url: string; init?: RequestInit }> },
  opts: { swapOk?: boolean; swapError?: string } = {},
) {
  const swapOk = opts.swapOk !== false;
  global.fetch = vi.fn().mockImplementation(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    capture.calls.push({ url: u, init });

    if (u.includes("/api/team")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [
          {
            id: "user-1",
            name: "Jayden Kowaider",
            email: "jayden@example.com",
            role: "staff",
            avatar: null,
            service: { id: "svc-1", name: "Lakemba" },
            active: true,
            activeRocks: 0,
            totalTodos: 0,
            completedTodos: 0,
            todoCompletionPct: 0,
            openIssues: 0,
            managedServices: 0,
            rocks: [],
          },
          {
            id: "user-2",
            name: "Daniel Smith",
            email: "daniel@example.com",
            role: "staff",
            avatar: null,
            service: { id: "svc-1", name: "Lakemba" },
            active: true,
            activeRocks: 0,
            totalTodos: 0,
            completedTodos: 0,
            todoCompletionPct: 0,
            openIssues: 0,
            managedServices: 0,
            rocks: [],
          },
          {
            id: "user-3",
            name: "Other Service Person",
            email: "other@example.com",
            role: "staff",
            avatar: null,
            service: { id: "svc-other", name: "Other" },
            active: true,
            activeRocks: 0,
            totalTodos: 0,
            completedTodos: 0,
            todoCompletionPct: 0,
            openIssues: 0,
            managedServices: 0,
            rocks: [],
          },
        ],
      } as unknown as Response;
    }

    if (u.includes("/api/shift-swaps")) {
      return {
        ok: swapOk,
        status: swapOk ? 201 : 400,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () =>
          swapOk
            ? { swap: { id: "swap-new" } }
            : { error: opts.swapError ?? "Swap failed" },
      } as unknown as Response;
    }

    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({}),
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe("ShiftSwapDialog", () => {
  let capture: { calls: Array<{ url: string; init?: RequestInit }> };

  beforeEach(() => {
    capture = { calls: [] };
    installFetchMock(capture);
  });

  it("renders nothing visible when open=false", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = makeWrapper(qc);
    render(
      <Wrapper>
        <ShiftSwapDialog
          open={false}
          onClose={() => {}}
          shift={baseShift}
          currentUserId="user-1"
        />
      </Wrapper>,
    );
    expect(screen.queryByText(/request shift swap/i)).toBeNull();
  });

  it("target dropdown excludes the current user and cross-service staff", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = makeWrapper(qc);

    render(
      <Wrapper>
        <ShiftSwapDialog
          open
          onClose={() => {}}
          shift={baseShift}
          currentUserId="user-1"
        />
      </Wrapper>,
    );

    // Wait for team load → dropdown options populate
    await waitFor(() => {
      expect(screen.getByRole("option", { name: /Daniel Smith/i })).toBeDefined();
    });

    // Self excluded
    expect(screen.queryByRole("option", { name: /Jayden Kowaider/i })).toBeNull();
    // Cross-service staff excluded
    expect(screen.queryByRole("option", { name: /Other Service Person/i })).toBeNull();
  });

  it("submitting posts to /api/shift-swaps with the right body and triggers onSubmitted", async () => {
    const onSubmitted = vi.fn();
    const onClose = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = makeWrapper(qc);

    render(
      <Wrapper>
        <ShiftSwapDialog
          open
          onClose={onClose}
          shift={baseShift}
          currentUserId="user-1"
          onSubmitted={onSubmitted}
        />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByRole("option", { name: /Daniel Smith/i })).toBeDefined();
    });

    // Pick target
    fireEvent.change(screen.getByLabelText(/swap with/i), {
      target: { value: "user-2" },
    });
    // Reason
    fireEvent.change(screen.getByLabelText(/reason/i), {
      target: { value: "Medical appointment" },
    });

    fireEvent.click(screen.getByRole("button", { name: /send request/i }));

    await waitFor(() => {
      const postCall = capture.calls.find(
        (c) =>
          c.url.includes("/api/shift-swaps") &&
          (c.init?.method ?? "GET") === "POST",
      );
      expect(postCall).toBeDefined();
    });

    const postCall = capture.calls.find(
      (c) =>
        c.url.includes("/api/shift-swaps") &&
        (c.init?.method ?? "GET") === "POST",
    )!;
    const body = JSON.parse(String(postCall.init!.body));
    expect(body.shiftId).toBe("shift-42");
    expect(body.targetId).toBe("user-2");
    expect(body.reason).toBe("Medical appointment");

    await waitFor(() => {
      expect(onSubmitted).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("shows a destructive toast when the API returns an error", async () => {
    const { toast } = await import("@/hooks/useToast");
    capture = { calls: [] };
    installFetchMock(capture, { swapOk: false, swapError: "Target is not active" });

    const onSubmitted = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = makeWrapper(qc);

    render(
      <Wrapper>
        <ShiftSwapDialog
          open
          onClose={() => {}}
          shift={baseShift}
          currentUserId="user-1"
          onSubmitted={onSubmitted}
        />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByRole("option", { name: /Daniel Smith/i })).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText(/swap with/i), {
      target: { value: "user-2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send request/i }));

    await waitFor(() => {
      const calls = (toast as unknown as ReturnType<typeof vi.fn>).mock.calls;
      const destructive = calls.find(
        (c) => (c[0] as { variant?: string })?.variant === "destructive",
      );
      expect(destructive).toBeDefined();
    });

    expect(onSubmitted).not.toHaveBeenCalled();
  });
});
