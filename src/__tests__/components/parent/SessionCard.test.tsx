// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SessionCard } from "@/components/parent/ui/SessionCard";

describe("SessionCard", () => {
  // Friday Apr 24 2026 in en-AU locale
  const date = new Date("2026-04-24T09:00:00");

  it("renders day, date, label, sublabel in list variant", () => {
    const { getByText } = render(
      <SessionCard
        date={date}
        label="Sophia — ASC"
        sublabel="3:15pm pickup · Fitzroy North"
        status="confirmed"
      />,
    );
    expect(getByText("FRI")).toBeInTheDocument();
    expect(getByText("24")).toBeInTheDocument();
    expect(getByText("Sophia — ASC")).toBeInTheDocument();
    expect(getByText(/Fitzroy North/)).toBeInTheDocument();
  });

  it("shows status badge", () => {
    const { getByRole } = render(<SessionCard date={date} label="x" status="confirmed" />);
    expect(getByRole("status")).toBeInTheDocument();
  });

  it("supports tile variant for horizontal scrolls", () => {
    const { container } = render(
      <SessionCard date={date} label="x" status="confirmed" variant="tile" />,
    );
    expect((container.firstChild as HTMLElement).className).toContain("min-w-[128px]");
  });

  it("omits sublabel when not provided", () => {
    const { queryByText } = render(<SessionCard date={date} label="x" status="confirmed" />);
    expect(queryByText(/pickup/)).toBeNull();
  });
});
