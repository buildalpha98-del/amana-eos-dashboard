// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ─── Mocks ───────────────────────────────────────────────────────
// Mutated between tests to flip role/serviceId for permission branches.
const sessionRef: {
  id: string;
  role: string;
  serviceId: string | null;
  status: "authenticated" | "loading" | "unauthenticated";
} = {
  id: "user-me",
  role: "admin",
  serviceId: null,
  status: "authenticated",
};

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        id: sessionRef.id,
        email: "me@example.com",
        role: sessionRef.role,
        serviceId: sessionRef.serviceId,
      },
    },
    status: sessionRef.status,
  }),
}));

vi.mock("@/hooks/useToast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

import SwapsInboxPage from "@/app/(dashboard)/roster/swaps/page";

// ─── Helpers ─────────────────────────────────────────────────────

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnMount: false } },
  });
}

interface MockSwap {
  id: string;
  shiftId: string;
  proposerId: string;
  targetId: string;
  status: "proposed" | "accepted" | "approved" | "rejected" | "cancelled";
  reason: string | null;
  createdAt: string;
  shift: {
    id: string;
    date: string;
    shiftStart: string;
    shiftEnd: string;
    sessionType: string;
    serviceId: string;
  };
  proposer: { id: string; name: string };
  target: { id: string; name: string };
}

function installFetchMock(
  capture: { calls: Array<{ url: string; init?: RequestInit }> },
  swaps: MockSwap[],
) {
  global.fetch = vi.fn().mockImplementation(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    capture.calls.push({ url: u, init });

    if (u.includes("/api/shift-swaps") && !u.includes("/accept") && !u.includes("/reject") && !u.includes("/approve") && !u.includes("/cancel")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ swaps }),
      } as unknown as Response;
    }

    // Action endpoints
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ swap: { id: "ok" } }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe("SwapsInboxPage", () => {
  let capture: { calls: Array<{ url: string; init?: RequestInit }> };

  beforeEach(() => {
    capture = { calls: [] };
    sessionRef.id = "user-me";
    sessionRef.role = "admin";
    sessionRef.serviceId = null;
    sessionRef.status = "authenticated";
  });

  it("admin sees 'Pending my review' + 'My proposals' + 'History' sections", async () => {
    installFetchMock(capture, []);
    const qc = makeClient();
    const Wrapper = makeWrapper(qc);
    render(
      <Wrapper>
        <SwapsInboxPage />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("swaps-pending-review")).toBeTruthy();
    });
    expect(screen.getByTestId("swaps-my-proposals")).toBeTruthy();
    expect(screen.getByTestId("swaps-history")).toBeTruthy();
  });

  it("staff role does NOT see 'Pending my review'", async () => {
    sessionRef.role = "staff";
    installFetchMock(capture, []);
    const qc = makeClient();
    const Wrapper = makeWrapper(qc);
    render(
      <Wrapper>
        <SwapsInboxPage />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("swaps-my-proposals")).toBeTruthy();
    });
    expect(screen.queryByTestId("swaps-pending-review")).toBeNull();
  });

  it("admin Approve button POSTs to /api/shift-swaps/<id>/approve", async () => {
    const now = new Date().toISOString();
    const swaps: MockSwap[] = [
      {
        id: "sw-1",
        shiftId: "shift-1",
        proposerId: "u-a",
        targetId: "u-b",
        status: "accepted",
        reason: null,
        createdAt: now,
        shift: {
          id: "shift-1",
          date: new Date("2026-04-22").toISOString(),
          shiftStart: "07:00",
          shiftEnd: "09:00",
          sessionType: "bsc",
          serviceId: "svc-1",
        },
        proposer: { id: "u-a", name: "Proposer" },
        target: { id: "u-b", name: "Target" },
      },
    ];
    installFetchMock(capture, swaps);
    const qc = makeClient();
    const Wrapper = makeWrapper(qc);

    render(
      <Wrapper>
        <SwapsInboxPage />
      </Wrapper>,
    );

    const approveBtn = await screen.findByRole("button", { name: /approve/i });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      const postCall = capture.calls.find(
        (c) =>
          c.url.endsWith("/api/shift-swaps/sw-1/approve") &&
          c.init?.method === "POST",
      );
      expect(postCall).toBeDefined();
    });
  });

  it("proposer's own proposed swap appears in 'My proposals' with Cancel button", async () => {
    sessionRef.role = "staff";
    sessionRef.id = "u-a";
    const now = new Date().toISOString();
    const swaps: MockSwap[] = [
      {
        id: "sw-2",
        shiftId: "shift-2",
        proposerId: "u-a",
        targetId: "u-b",
        status: "proposed",
        reason: null,
        createdAt: now,
        shift: {
          id: "shift-2",
          date: new Date("2026-04-22").toISOString(),
          shiftStart: "07:00",
          shiftEnd: "09:00",
          sessionType: "bsc",
          serviceId: "svc-1",
        },
        proposer: { id: "u-a", name: "Proposer" },
        target: { id: "u-b", name: "Target" },
      },
    ];
    installFetchMock(capture, swaps);
    const qc = makeClient();
    const Wrapper = makeWrapper(qc);

    render(
      <Wrapper>
        <SwapsInboxPage />
      </Wrapper>,
    );

    const cancelBtn = await screen.findByRole("button", { name: /cancel/i });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      const postCall = capture.calls.find(
        (c) =>
          c.url.endsWith("/api/shift-swaps/sw-2/cancel") &&
          c.init?.method === "POST",
      );
      expect(postCall).toBeDefined();
    });
  });
});
