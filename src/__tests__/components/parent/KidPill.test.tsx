// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { KidPill } from "@/components/ui/v2";

describe("KidPill", () => {
  const child = { id: "c1", name: "Sophia", subtitle: "Year 2 · Fitzroy North" };

  it("renders name and subtitle", () => {
    const { getByText } = render(<KidPill child={child} />);
    expect(getByText("Sophia")).toBeInTheDocument();
    expect(getByText(/Year 2/)).toBeInTheDocument();
  });

  it("renders as link when href provided", () => {
    const { getByRole } = render(<KidPill child={child} href="/parent/children/c1" />);
    expect(getByRole("link")).toHaveAttribute("href", "/parent/children/c1");
  });

  it("renders status badge when status provided", () => {
    const { getByRole } = render(<KidPill child={child} status="in-care" />);
    expect(getByRole("status")).toBeInTheDocument();
  });

  it("calls onPress when tapped (no href)", () => {
    const handler = vi.fn();
    const { getByRole } = render(<KidPill child={child} onPress={handler} />);
    fireEvent.click(getByRole("button"));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("omits subtitle when absent", () => {
    const { queryByText } = render(<KidPill child={{ id: "x", name: "X" }} />);
    expect(queryByText(/Year/)).toBeNull();
  });
});
