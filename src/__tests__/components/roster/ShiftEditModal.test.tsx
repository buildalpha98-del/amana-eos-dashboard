// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ShiftEditModal } from "@/components/roster/ShiftEditModal";

vi.mock("@/hooks/useToast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function installFetchMock(capture: { calls: Array<{ url: string; init?: RequestInit }> }) {
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
            name: "Jane Doe",
            email: "jane@example.com",
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

    // POST / PATCH / DELETE for roster shifts
    if (u.includes("/api/roster/shifts")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ id: "shift-new" }),
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

describe("ShiftEditModal", () => {
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
        <ShiftEditModal
          open={false}
          onClose={() => {}}
          mode="create"
          serviceId="svc-1"
        />
      </Wrapper>,
    );
    // Dialog title should not render
    expect(screen.queryByText(/new shift/i)).toBeNull();
    expect(screen.queryByText(/edit shift/i)).toBeNull();
  });

  it("create mode: submit posts to /api/roster/shifts", async () => {
    const onSaved = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = makeWrapper(qc);

    render(
      <Wrapper>
        <ShiftEditModal
          open
          onClose={() => {}}
          mode="create"
          serviceId="svc-1"
          defaultDate="2026-04-22"
          onSaved={onSaved}
        />
      </Wrapper>,
    );

    // Wait for team to load (for user dropdown options)
    await waitFor(() => {
      expect(screen.getByRole("option", { name: /Jane Doe/i })).toBeDefined();
    });

    // Pick staff
    const userSelect = screen.getByLabelText(/staff/i) as HTMLSelectElement;
    fireEvent.change(userSelect, { target: { value: "user-1" } });

    // Session type
    const sessionSelect = screen.getByLabelText(/session type/i) as HTMLSelectElement;
    fireEvent.change(sessionSelect, { target: { value: "bsc" } });

    // Start/end
    const startInput = screen.getByLabelText(/shift start/i) as HTMLInputElement;
    fireEvent.change(startInput, { target: { value: "07:00" } });
    const endInput = screen.getByLabelText(/shift end/i) as HTMLInputElement;
    fireEvent.change(endInput, { target: { value: "09:00" } });

    // Submit
    const submitBtn = screen.getByRole("button", { name: /save|create/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const postCall = capture.calls.find(
        (c) =>
          c.url.includes("/api/roster/shifts") &&
          (c.init?.method ?? "GET") === "POST",
      );
      expect(postCall).toBeDefined();
    });

    const postCall = capture.calls.find(
      (c) =>
        c.url.includes("/api/roster/shifts") &&
        (c.init?.method ?? "GET") === "POST",
    )!;
    const body = JSON.parse(String(postCall.init!.body));
    expect(body.serviceId).toBe("svc-1");
    expect(body.userId).toBe("user-1");
    expect(body.date).toBe("2026-04-22");
    expect(body.sessionType).toBe("bsc");
    expect(body.shiftStart).toBe("07:00");
    expect(body.shiftEnd).toBe("09:00");
    expect(body.status).toBe("draft");

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it("edit mode: submit PATCHes /api/roster/shifts/[id]", async () => {
    const onSaved = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = makeWrapper(qc);

    render(
      <Wrapper>
        <ShiftEditModal
          open
          onClose={() => {}}
          mode="edit"
          serviceId="svc-1"
          shift={{
            id: "shift-42",
            userId: "user-1",
            date: "2026-04-22",
            sessionType: "bsc",
            shiftStart: "07:00",
            shiftEnd: "09:00",
            role: "Educator",
            staffName: "Jane Doe",
          }}
          onSaved={onSaved}
        />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByRole("option", { name: /Jane Doe/i })).toBeDefined();
    });

    // Change end time
    const endInput = screen.getByLabelText(/shift end/i) as HTMLInputElement;
    fireEvent.change(endInput, { target: { value: "10:00" } });

    const submitBtn = screen.getByRole("button", { name: /save/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const patchCall = capture.calls.find(
        (c) =>
          c.url.includes("/api/roster/shifts/shift-42") &&
          c.init?.method === "PATCH",
      );
      expect(patchCall).toBeDefined();
    });

    const patchCall = capture.calls.find(
      (c) =>
        c.url.includes("/api/roster/shifts/shift-42") &&
        c.init?.method === "PATCH",
    )!;
    const body = JSON.parse(String(patchCall.init!.body));
    expect(body.shiftEnd).toBe("10:00");

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it("delete button calls DELETE /api/roster/shifts/[id]", async () => {
    const onSaved = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = makeWrapper(qc);

    // Stub window.confirm → true
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <Wrapper>
        <ShiftEditModal
          open
          onClose={() => {}}
          mode="edit"
          serviceId="svc-1"
          shift={{
            id: "shift-42",
            userId: "user-1",
            date: "2026-04-22",
            sessionType: "bsc",
            shiftStart: "07:00",
            shiftEnd: "09:00",
            role: null,
            staffName: "Jane Doe",
          }}
          onSaved={onSaved}
        />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByRole("option", { name: /Jane Doe/i })).toBeDefined();
    });

    const deleteBtn = screen.getByRole("button", { name: /delete/i });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      const delCall = capture.calls.find(
        (c) =>
          c.url.includes("/api/roster/shifts/shift-42") &&
          c.init?.method === "DELETE",
      );
      expect(delCall).toBeDefined();
    });

    confirmSpy.mockRestore();
  });

  it("shiftEnd <= shiftStart blocks submit and shows an error", async () => {
    const { toast } = await import("@/hooks/useToast");
    const onSaved = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = makeWrapper(qc);

    render(
      <Wrapper>
        <ShiftEditModal
          open
          onClose={() => {}}
          mode="create"
          serviceId="svc-1"
          defaultDate="2026-04-22"
          onSaved={onSaved}
        />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByRole("option", { name: /Jane Doe/i })).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText(/staff/i), { target: { value: "user-1" } });
    fireEvent.change(screen.getByLabelText(/session type/i), { target: { value: "bsc" } });
    fireEvent.change(screen.getByLabelText(/shift start/i), { target: { value: "09:00" } });
    fireEvent.change(screen.getByLabelText(/shift end/i), { target: { value: "07:00" } });

    fireEvent.click(screen.getByRole("button", { name: /save|create/i }));

    // Should NOT have posted to the roster endpoint
    await new Promise((r) => setTimeout(r, 30));
    const postCalls = capture.calls.filter(
      (c) =>
        c.url.includes("/api/roster/shifts") &&
        (c.init?.method ?? "GET") === "POST",
    );
    expect(postCalls).toHaveLength(0);
    expect(toast).toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
