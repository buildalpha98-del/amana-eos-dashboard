// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SectionLabel } from "@/components/ui/v2";

describe("SectionLabel", () => {
  it("renders the label", () => {
    const { getByText } = render(<SectionLabel label="Children" />);
    expect(getByText("Children")).toBeInTheDocument();
  });

  it("renders action link when provided", () => {
    const { getByRole } = render(
      <SectionLabel label="Children" action={{ href: "/parent/children", text: "View all" }} />,
    );
    const link = getByRole("link", { name: "View all" });
    expect(link).toHaveAttribute("href", "/parent/children");
  });

  it("omits action when not provided", () => {
    const { queryByRole } = render(<SectionLabel label="Children" />);
    expect(queryByRole("link")).toBeNull();
  });
});
