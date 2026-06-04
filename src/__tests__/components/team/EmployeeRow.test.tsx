/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// EmployeeRow now uses TanStack mutations for quick-actions and
// resend-invite; mock navigation + fetch so the hooks don't try to
// hit a real endpoint or router.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/fetch-api", () => ({
  fetchApi: vi.fn(),
  mutateApi: vi.fn(),
}));

import { EmployeeRow } from "@/components/team/EmployeeRow";

const ALICE = {
  id: "u-1",
  name: "Alice Adams",
  email: "alice@example.com",
  avatar: null,
  phone: "0400000001",
  role: "staff",
  service: { id: "svc-1", name: "Mawson Lakes" },
  status: "active" as const,
  tags: [] as string[],
  payrollLinked: true,
  hasActiveContract: true,
};

function renderRow(props: React.ComponentProps<typeof EmployeeRow>) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <table>
        <tbody>
          <EmployeeRow {...props} />
        </tbody>
      </table>
    </QueryClientProvider>,
  );
}

describe("EmployeeRow", () => {
  it("renders name + role + service + status for an admin viewer", () => {
    renderRow({ employee: ALICE, viewerRole: "admin", viewerId: "viewer-1", listSearchString: "" });
    expect(screen.getByText("Alice Adams")).toBeInTheDocument();
    // Role display name resolves via ROLE_DISPLAY_NAMES — "staff" → "Educator"
    expect(screen.getByText("Educator")).toBeInTheDocument();
    expect(screen.getByText("Mawson Lakes")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("wraps name cell in <Link> for non-marketing viewers and preserves listSearchString", () => {
    renderRow({
      employee: ALICE,
      viewerRole: "admin",
      viewerId: "viewer-1",
      listSearchString: "?q=ali",
    });
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/staff/u-1?q=ali");
  });

  it("does NOT wrap row in <Link> for marketing viewers", () => {
    renderRow({
      employee: ALICE,
      viewerRole: "marketing",
      viewerId: "viewer-1",
      listSearchString: "",
    });
    expect(screen.queryByRole("link")).toBeNull();
    // But the row still renders all its data
    expect(screen.getByText("Alice Adams")).toBeInTheDocument();
  });

  it("renders a 'Pending' status pill in amber", () => {
    renderRow({
      employee: { ...ALICE, status: "pending" },
      viewerRole: "admin",
      viewerId: "viewer-1",
      listSearchString: "",
    });
    const pill = screen.getByText("Pending");
    expect(pill.className).toMatch(/amber/);
  });

  it("renders an em-dash for null service", () => {
    renderRow({
      employee: { ...ALICE, service: null },
      viewerRole: "admin",
      viewerId: "viewer-1",
      listSearchString: "",
    });
    const row = screen.getByTestId("employee-row-u-1");
    expect(within(row).getByText("—")).toBeInTheDocument();
  });

  it("hides email when null (PII-stripped marketing row)", () => {
    renderRow({
      employee: { ...ALICE, email: null, phone: null },
      viewerRole: "marketing",
      viewerId: "viewer-1",
      listSearchString: "",
    });
    expect(screen.queryByText("alice@example.com")).toBeNull();
  });

  // 2026-06-03: red badge for employees who haven't been linked to
  // their EH Payroll record yet — Daniel wanted this visible at a
  // glance on the /team list so we don't silently ship someone
  // without payslips / leave / expenses.
  describe("EH Payroll link badge", () => {
    it("shows the badge for an active employee without a payroll link", () => {
      renderRow({
        employee: { ...ALICE, payrollLinked: false },
        viewerRole: "admin",
        viewerId: "viewer-1",
        listSearchString: "",
      });
      expect(screen.getByTestId("payroll-warning-u-1")).toBeInTheDocument();
    });

    it("hides the badge when the employee IS linked to payroll", () => {
      renderRow({
        employee: { ...ALICE, payrollLinked: true },
        viewerRole: "admin",
        viewerId: "viewer-1",
        listSearchString: "",
      });
      expect(screen.queryByTestId("payroll-warning-u-1")).toBeNull();
    });

    it("hides the badge for deactivated employees (not expected to be on payroll)", () => {
      renderRow({
        employee: { ...ALICE, payrollLinked: false, status: "deactivated" },
        viewerRole: "admin",
        viewerId: "viewer-1",
        listSearchString: "",
      });
      expect(screen.queryByTestId("payroll-warning-u-1")).toBeNull();
    });

    it("shows the badge for pending invites (link as part of onboarding)", () => {
      renderRow({
        employee: { ...ALICE, payrollLinked: false, status: "pending" },
        viewerRole: "admin",
        viewerId: "viewer-1",
        listSearchString: "",
      });
      expect(screen.getByTestId("payroll-warning-u-1")).toBeInTheDocument();
    });
  });

  // 2026-06-03: yellow badge for staff who don't have a contract issued
  // (active or draft). Daniel wanted a visual cue alongside the red
  // payroll badge so admins can spot un-papered staff at a glance.
  describe("contract badge", () => {
    it("shows when active and hasActiveContract=false", () => {
      renderRow({
        employee: { ...ALICE, hasActiveContract: false },
        viewerRole: "admin",
        viewerId: "viewer-1",
        listSearchString: "",
      });
      expect(screen.getByTestId("contract-warning-u-1")).toBeInTheDocument();
    });

    it("hides when employee has a contract on file", () => {
      renderRow({
        employee: { ...ALICE, hasActiveContract: true },
        viewerRole: "admin",
        viewerId: "viewer-1",
        listSearchString: "",
      });
      expect(screen.queryByTestId("contract-warning-u-1")).toBeNull();
    });

    it("hides for deactivated employees", () => {
      renderRow({
        employee: { ...ALICE, hasActiveContract: false, status: "deactivated" },
        viewerRole: "admin",
        viewerId: "viewer-1",
        listSearchString: "",
      });
      expect(screen.queryByTestId("contract-warning-u-1")).toBeNull();
    });

    it("shows for pending invites (paper them as part of onboarding)", () => {
      renderRow({
        employee: { ...ALICE, hasActiveContract: false, status: "pending" },
        viewerRole: "admin",
        viewerId: "viewer-1",
        listSearchString: "",
      });
      expect(screen.getByTestId("contract-warning-u-1")).toBeInTheDocument();
    });

    it("shows both badges independently", () => {
      renderRow({
        employee: {
          ...ALICE,
          payrollLinked: false,
          hasActiveContract: false,
        },
        viewerRole: "admin",
        viewerId: "viewer-1",
        listSearchString: "",
      });
      expect(screen.getByTestId("payroll-warning-u-1")).toBeInTheDocument();
      expect(screen.getByTestId("contract-warning-u-1")).toBeInTheDocument();
    });
  });
});
