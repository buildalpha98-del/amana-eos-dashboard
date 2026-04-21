// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/useToast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { NotificationPopover } from "@/components/layout/NotificationPopover";

type MockNotification = {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
};

function installFetch(opts: { notifications: MockNotification[] }) {
  const call = vi.fn().mockImplementation((url: string) => {
    if (url.includes("/api/notifications/mark-all-read")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: (h: string) => (h === "content-type" ? "application/json" : null) },
        json: async () => ({ updated: opts.notifications.filter((n) => !n.read).length }),
      });
    }
    if (url.includes("/mark-read")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: (h: string) => (h === "content-type" ? "application/json" : null) },
        json: async () => ({ notification: { ...opts.notifications[0], read: true } }),
      });
    }
    if (url.includes("/api/notifications")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: (h: string) => (h === "content-type" ? "application/json" : null) },
        json: async () => ({ notifications: opts.notifications }),
      });
    }
    return Promise.reject(new Error(`Unexpected fetch URL: ${url}`));
  });
  global.fetch = call as unknown as typeof fetch;
  return call;
}

function renderPopover(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("NotificationPopover", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    pushMock.mockReset();
  });

  it("renders the empty state when there are no notifications", async () => {
    installFetch({ notifications: [] });
    renderPopover(<NotificationPopover open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/no new notifications/i)).toBeTruthy();
    });
  });

  it("renders a list of notifications with title and body", async () => {
    const notifications: MockNotification[] = [
      {
        id: "n1",
        userId: "u1",
        type: "leave_approved",
        title: "Leave approved",
        body: "Your leave from 2026-04-01 to 2026-04-03 was approved",
        link: "/leave?id=lr-1",
        read: false,
        readAt: null,
        createdAt: new Date().toISOString(),
      },
      {
        id: "n2",
        userId: "u1",
        type: "leave_submitted",
        title: "Daniel submitted a leave request",
        body: "annual from 2026-05-01 to 2026-05-05",
        link: "/leave?id=lr-2",
        read: true,
        readAt: new Date().toISOString(),
        createdAt: new Date(Date.now() - 60_000).toISOString(),
      },
    ];
    installFetch({ notifications });
    renderPopover(<NotificationPopover open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Leave approved")).toBeTruthy();
      expect(screen.getByText("Daniel submitted a leave request")).toBeTruthy();
    });
  });

  it('shows "Mark all read" when there is an unread item and calls the endpoint', async () => {
    const notifications: MockNotification[] = [
      {
        id: "n1",
        userId: "u1",
        type: "timesheet_submitted",
        title: "Mirna submitted a timesheet",
        body: "Week ending 2026-04-18",
        link: "/timesheets?id=ts-1",
        read: false,
        readAt: null,
        createdAt: new Date().toISOString(),
      },
    ];
    const fetchCall = installFetch({ notifications });
    renderPopover(<NotificationPopover open={true} onClose={vi.fn()} />);

    const markAll = await screen.findByRole("button", { name: /mark all read/i });
    fireEvent.click(markAll);

    await waitFor(() => {
      const urls = fetchCall.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(urls.some((u) => u.includes("/api/notifications/mark-all-read"))).toBe(true);
    });
  });

  it("returns null when `open` is false", () => {
    installFetch({ notifications: [] });
    const { container } = renderPopover(
      <NotificationPopover open={false} onClose={vi.fn()} />,
    );
    // When closed, the popover should render nothing.
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
