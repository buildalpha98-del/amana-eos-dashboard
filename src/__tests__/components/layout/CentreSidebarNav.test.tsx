// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

let search = new URLSearchParams("tab=daily&sub=roster");
vi.mock("next/navigation", () => ({
  usePathname: () => "/services/svc-1",
  useSearchParams: () => search,
}));
let role = "member";
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { role } } }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { CentreSidebarNav } from "@/components/layout/CentreSidebarNav";

describe("CentreSidebarNav", () => {
  it("is the centre's own menu, with Notifications and Handbook below", () => {
    render(<CentreSidebarNav serviceId="svc-1" collapsed={false} />);
    for (const label of ["Today", "Service Information", "Staff", "Families", "Daily Ops", "Documents", "Notifications", "Handbook & Help"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText(/My Pay|My Leave|My Contract/)).toBeNull();
  });

  it("opens the active section and links each page by ?tab=&sub=", () => {
    render(<CentreSidebarNav serviceId="svc-1" collapsed={false} />);
    const roster = screen.getByRole("link", { name: "Weekly Roster" });
    expect(roster.getAttribute("href")).toBe("/services/svc-1?tab=daily&sub=roster");
    expect(screen.getByRole("link", { name: "Today" }).getAttribute("href")).toBe("/services/svc-1");
  });

  it("opens another section on tap", () => {
    search = new URLSearchParams("");
    render(<CentreSidebarNav serviceId="svc-1" collapsed={false} />);
    expect(screen.queryByRole("link", { name: "Staff files" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Documents/ }));
    expect(screen.getByRole("link", { name: "Staff files" }).getAttribute("href")).toBe(
      "/services/svc-1?tab=documents&sub=staff-files",
    );
  });

  it("can collapse the section you're in", () => {
    search = new URLSearchParams("tab=overview&sub=forms");
    render(<CentreSidebarNav serviceId="svc-1" collapsed={false} />);
    expect(screen.getByRole("link", { name: "Forms & excursions" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Service Information/ }));
    expect(screen.queryByRole("link", { name: "Forms & excursions" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Service Information/ }));
    expect(screen.getByRole("link", { name: "Forms & excursions" })).toBeTruthy();
  });

  it("closes the phone drawer when a page is chosen", () => {
    const onNavigate = vi.fn();
    render(<CentreSidebarNav serviceId="svc-1" collapsed={false} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("link", { name: "Today" }));
    expect(onNavigate).toHaveBeenCalled();
  });
});

describe("CentreSidebarNav for an educator (2026-10-08)", () => {
  it("shows only the floor-of-the-shift sections, without the footer links", () => {
    role = "staff";
    search = new URLSearchParams("");
    render(<CentreSidebarNav serviceId="svc-1" collapsed={false} footerLinks={false} />);
    for (const label of ["Today", "Daily Ops", "Program", "Compliance", "Documents"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    for (const hidden of ["Service Information", "Staff", "Families", "EOS", "Finance", "Notifications"]) {
      expect(screen.queryByText(hidden)).toBeNull();
    }
    role = "member";
  });
});
