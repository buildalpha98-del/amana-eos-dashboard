// @vitest-environment jsdom
/** The phone tab bar puts each role's own centre one tap away. */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

let session: { user: Record<string, unknown> } | null = null;
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: session }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/my-portal" }));
vi.mock("@/hooks/useNotifications", () => ({
  useUnreadNotificationCount: () => ({ data: { count: 0 } }),
}));

import { MobileTabBar } from "@/components/layout/MobileTabBar";

const tabs = () =>
  screen.getAllByRole("link").map((a) => `${a.textContent?.trim()} ${a.getAttribute("href")}`);

describe("MobileTabBar", () => {
  it("gives a Coordinator their centre and roster (staff-UX Round 2)", () => {
    session = { user: { role: "member", serviceId: "svc-1" } };
    render(<MobileTabBar onMorePress={() => {}} />);
    expect(tabs()).toEqual([
      "Home /my-portal",
      "Centre /services/svc-1",
      "Roster /roster",
      "Pay & Leave /my-pay",
    ]);
  });

  it("keeps the educator set", () => {
    session = { user: { role: "staff", serviceId: "svc-1" } };
    render(<MobileTabBar onMorePress={() => {}} />);
    expect(tabs()).toContain("Centre /services/svc-1");
    expect(tabs()).toContain("Shifts /my-day");
  });

  it("keeps the centre login's own set", () => {
    session = { user: { role: "member", serviceId: "svc-1", isCentreAccount: true } };
    render(<MobileTabBar onMorePress={() => {}} />);
    expect(tabs()[0]).toBe("My Centre /services/svc-1");
  });
});
