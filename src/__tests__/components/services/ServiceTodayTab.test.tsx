// @vitest-environment jsdom
/**
 * The centre's Today screen (staff-UX Round 2, 2026-10-09): one screen that
 * runs the shift, numbers from /api/services/[id]/dashboard, role-aware.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let session: { user: Record<string, unknown> } | null = null;
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: session, status: "authenticated" }),
}));

const day = {
  service: { id: "svc-1", name: "Greenacre", code: "MFIS-GA", capacity: 60 },
  asOf: "2026-10-09T05:00:00Z",
  totals: { booked: 44, inCare: 27, absent: 0, casual: 2 },
  programmes: [
    { key: "asc", name: "Amana Afternoons", booked: 35, inCare: 27, wentHome: 0, absent: 0, casual: 2, educatorsOnFloor: 3, staffClockedIn: 1, staffRequired: 2, minRatio: "1:15", inRatio: false, leader: "Sarah Awad", leaderRole: "RP", children: [] },
    { key: "bsc", name: "Rise and Shine", booked: 9, inCare: 0, wentHome: 9, absent: 0, casual: 0, educatorsOnFloor: 0, staffClockedIn: 0, staffRequired: 0, minRatio: "1:15", inRatio: true, leader: null, leaderRole: null, children: [] },
  ],
  visitors: [{ id: "v1", name: "Hina Asif", organisation: null, since: "07:01" }],
  staff: {
    onDuty: [{ id: "a", name: "Sarah Awad", role: null, avatar: null, since: "14:50" }],
    notCheckedIn: [{ id: "b", name: "Safa Melhem", role: null, shiftStart: "15:00" }],
    rosteredToday: 4,
  },
  attention: {
    medicationsGivenToday: 1,
    checklistsOutstanding: 2,
    pendingBookingRequests: 1,
    openIncidents: 2,
    expiringCerts: 0,
    handoversToday: 0,
    postsAwaitingApproval: 3,
    purchaseApprovalsPending: 0,
    visitorsOnSite: 1,
  },
};
let response: typeof day = day;
vi.mock("@/lib/fetch-api", () => ({ fetchApi: vi.fn(async () => response) }));

vi.mock("@/components/my-portal/MyClockCard", () => ({
  MyClockCard: () => <div data-testid="clock-card" />,
}));
vi.mock("@/components/services/ShiftHandoverWidget", () => ({ ShiftHandoverWidget: () => <div /> }));
vi.mock("@/components/services/ChecklistsTodayWidget", () => ({ ChecklistsTodayWidget: () => <div /> }));
vi.mock("@/components/services/DoorIpadCard", () => ({
  DoorIpadCard: () => <div data-testid="door-ipad-card" />,
}));
vi.mock("@/components/services/ServiceTodayPanel", () => ({
  ServiceTodayPanel: () => <div data-testid="todo-panel" />,
}));

import { ServiceTodayTab } from "@/components/services/ServiceTodayTab";

function renderToday() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ServiceTodayTab serviceId="svc-1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  response = day;
});

describe("Today — educator", () => {
  beforeEach(() => {
    session = { user: { id: "u-ed", role: "staff", serviceId: "svc-1" } };
  });

  it("shows attendances in / booked, linking to the door", async () => {
    renderToday();
    const att = await screen.findByRole("link", { name: /Attendances today/ });
    expect(att.getAttribute("href")).toBe("/services/svc-1?tab=daily&sub=roll-call");
    expect(att.textContent).toMatch(/27 \/ 44/);
  });

  it("gives each room a ratio badge from staff signed in vs required", async () => {
    renderToday();
    const card = await screen.findByRole("region", { name: "Amana Afternoons ratio" });
    expect(card.textContent).toMatch(/Need 1 more staff/);
    expect(card.textContent).toMatch(/Staff signed in 1 · Required 2/);
  });

  it("shows the clock-in card, the Responsible Person, staff signed in and visitors", async () => {
    renderToday();
    expect(await screen.findByTestId("clock-card")).toBeDefined();
    expect(screen.getByText("Sarah Awad", { selector: "strong" })).toBeDefined();
    expect(screen.getByText("since 14:50")).toBeDefined();
    expect(screen.getByText("not in · 15:00")).toBeDefined();
    expect(screen.getByText("Hina Asif")).toBeDefined();
  });

  it("has no approvals box or management to-dos", async () => {
    renderToday();
    await screen.findByRole("link", { name: /Attendances today/ });
    expect(screen.queryByText("Needs you")).toBeNull();
    expect(screen.queryByTestId("todo-panel")).toBeNull();
    expect(screen.queryByTestId("door-ipad-card")).toBeNull();
  });

  it("tells an educator to raise a missing Responsible Person, without a link they can't use", async () => {
    renderToday();
    expect(await screen.findByText(/Tell your Coordinator/)).toBeDefined();
    expect(screen.queryByRole("link", { name: "not set" })).toBeNull();
  });
});

describe("Today — Coordinator", () => {
  beforeEach(() => {
    session = { user: { id: "u-co", role: "member", serviceId: "svc-1" } };
  });

  it("puts what's waiting on them in Needs you, only the non-zero items", async () => {
    renderToday();
    expect(await screen.findByText("Needs you")).toBeDefined();
    expect(screen.getByRole("link", { name: /Posts waiting for approval/ }).getAttribute("href")).toBe(
      "/services/svc-1?tab=daily&sub=posts",
    );
    expect(screen.getByRole("link", { name: /Booking requests/ }).getAttribute("href")).toBe("/bookings");
    expect(screen.queryByText(/Purchase approvals/)).toBeNull();
    expect(screen.getByTestId("todo-panel")).toBeDefined();
  });

  it("says so when nothing is waiting", async () => {
    response = {
      ...day,
      attention: { ...day.attention, postsAwaitingApproval: 0, openIncidents: 0, pendingBookingRequests: 0 },
    };
    renderToday();
    expect(await screen.findByText(/All clear/)).toBeDefined();
  });

  it("links a missing Responsible Person to the roster", async () => {
    renderToday();
    const link = await screen.findByRole("link", { name: "not set" });
    expect(link.getAttribute("href")).toBe("/services/svc-1?tab=daily&sub=roster");
  });
});

describe("Today — centre login (shared mailbox)", () => {
  it("has no clock-in card — a shared login isn't a person", async () => {
    session = { user: { id: "u-centre", role: "member", serviceId: "svc-1", isCentreAccount: true } };
    renderToday();
    await screen.findByRole("link", { name: /Attendances today/ });
    expect(screen.queryByTestId("clock-card")).toBeNull();
    expect(screen.getByText("Needs you")).toBeDefined();
    expect(screen.getByTestId("door-ipad-card")).toBeDefined();
  });
});
