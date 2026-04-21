// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ActionRequiredWidget } from "@/components/team/ActionRequiredWidget";

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

function installFetchMock(counts: {
  certsExpiring: number;
  leavePending: number;
  timesheetsPending: number;
}) {
  global.fetch = vi.fn().mockImplementation(async (url: string | URL) => {
    const u = String(url);
    if (u.includes("/api/team/action-counts")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => counts,
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

describe("ActionRequiredWidget — role visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing for role=staff (hidden)", () => {
    installFetchMock({ certsExpiring: 5, leavePending: 3, timesheetsPending: 2 });
    const qc = makeClient();
    const { container } = render(
      <ActionRequiredWidget userRole="staff" />,
      { wrapper: makeWrapper(qc) },
    );

    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for role=member (hidden)", () => {
    installFetchMock({ certsExpiring: 5, leavePending: 3, timesheetsPending: 2 });
    const qc = makeClient();
    const { container } = render(
      <ActionRequiredWidget userRole="member" />,
      { wrapper: makeWrapper(qc) },
    );

    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for role=marketing (hidden)", () => {
    installFetchMock({ certsExpiring: 5, leavePending: 3, timesheetsPending: 2 });
    const qc = makeClient();
    const { container } = render(
      <ActionRequiredWidget userRole="marketing" />,
      { wrapper: makeWrapper(qc) },
    );

    expect(container.firstChild).toBeNull();
  });

  it("renders all three cards for role=admin", async () => {
    installFetchMock({ certsExpiring: 4, leavePending: 2, timesheetsPending: 6 });
    const qc = makeClient();
    render(<ActionRequiredWidget userRole="admin" />, {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => {
      expect(screen.getByText("4")).toBeInTheDocument();
    });
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(
      screen.getByText(/certs expiring within 30 days/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/leave requests pending approval/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/timesheets awaiting review/i),
    ).toBeInTheDocument();
  });

  it("renders all three cards for role=coordinator", async () => {
    installFetchMock({ certsExpiring: 1, leavePending: 0, timesheetsPending: 3 });
    const qc = makeClient();
    render(<ActionRequiredWidget userRole="coordinator" />, {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => {
      expect(screen.getByText("1")).toBeInTheDocument();
    });
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("hides the widget when all counts are 0", async () => {
    installFetchMock({ certsExpiring: 0, leavePending: 0, timesheetsPending: 0 });
    const qc = makeClient();
    const { container } = render(
      <ActionRequiredWidget userRole="admin" />,
      { wrapper: makeWrapper(qc) },
    );

    // Wait long enough for fetch to resolve, then assert nothing rendered
    await waitFor(() => {
      // The fetch was called
      expect(global.fetch).toHaveBeenCalled();
    });
    // No cards rendered
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText(/certs expiring/i)).not.toBeInTheDocument();
  });
});
