// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { StatusBadge } from "@/components/parent/ui/StatusBadge";

describe("StatusBadge", () => {
  it.each([
    ["in-care", "In care"],
    ["confirmed", "Confirmed"],
    ["requested", "Requested"],
    ["waitlisted", "Requested"], // falls back to requested label
    ["declined", "Declined"],
    ["new", "New"],
    ["overdue", "Overdue"],
  ] as const)("renders %s variant with label %s", (variant, label) => {
    const { getByText } = render(<StatusBadge variant={variant} />);
    expect(getByText(label)).toBeInTheDocument();
  });

  it("can override label", () => {
    const { getByText } = render(<StatusBadge variant="in-care" label="Signed in" />);
    expect(getByText("Signed in")).toBeInTheDocument();
  });

  it("has role=status for aria", () => {
    const { getByRole } = render(<StatusBadge variant="in-care" />);
    expect(getByRole("status")).toBeInTheDocument();
  });
});
