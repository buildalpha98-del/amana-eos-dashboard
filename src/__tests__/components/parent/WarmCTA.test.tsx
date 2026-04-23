// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { WarmCTA } from "@/components/parent/ui/WarmCTA";
import { Plus } from "lucide-react";

describe("WarmCTA", () => {
  it("renders title, sub, icon inside a link", () => {
    const { getByRole, getByText } = render(
      <WarmCTA icon={Plus} title="Book a casual" sub="Same day bookings" href="/parent/bookings" />,
    );
    const link = getByRole("link");
    expect(link).toHaveAttribute("href", "/parent/bookings");
    expect(getByText("Book a casual")).toBeInTheDocument();
    expect(getByText("Same day bookings")).toBeInTheDocument();
  });

  it("omits sub when absent", () => {
    const { queryByText } = render(<WarmCTA icon={Plus} title="X" href="/x" />);
    expect(queryByText("Same day")).toBeNull();
  });

  it("supports accent tone", () => {
    const { container } = render(<WarmCTA icon={Plus} title="X" href="/x" tone="accent" />);
    const link = container.firstChild as HTMLElement;
    expect(link.className).toContain("var(--color-accent)");
  });
});
