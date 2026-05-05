/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import React from "react";
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
};

function renderRow(props: React.ComponentProps<typeof EmployeeRow>) {
  return render(
    <table>
      <tbody>
        <EmployeeRow {...props} />
      </tbody>
    </table>,
  );
}

describe("EmployeeRow", () => {
  it("renders name + role + service + status for an admin viewer", () => {
    renderRow({ employee: ALICE, viewerRole: "admin", listSearchString: "" });
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
      listSearchString: "?q=ali",
    });
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/staff/u-1?q=ali");
  });

  it("does NOT wrap row in <Link> for marketing viewers", () => {
    renderRow({
      employee: ALICE,
      viewerRole: "marketing",
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
      listSearchString: "",
    });
    const pill = screen.getByText("Pending");
    expect(pill.className).toMatch(/amber/);
  });

  it("renders an em-dash for null service", () => {
    renderRow({
      employee: { ...ALICE, service: null },
      viewerRole: "admin",
      listSearchString: "",
    });
    const row = screen.getByTestId("employee-row-u-1");
    expect(within(row).getByText("—")).toBeInTheDocument();
  });

  it("hides email when null (PII-stripped marketing row)", () => {
    renderRow({
      employee: { ...ALICE, email: null, phone: null },
      viewerRole: "marketing",
      listSearchString: "",
    });
    expect(screen.queryByText("alice@example.com")).toBeNull();
  });
});
