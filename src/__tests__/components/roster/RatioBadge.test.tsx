// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { RatioBadge } from "@/components/roster/RatioBadge";

describe("RatioBadge", () => {
  it("shows 'No coverage needed' with gray styling when childrenCount is 0", () => {
    const { container } = render(<RatioBadge staffCount={0} childrenCount={0} />);
    expect(container.textContent).toMatch(/no coverage/i);
    const root = container.firstChild as HTMLElement | null;
    expect(root?.className).toMatch(/gray/);
  });

  it("shows 'No staff rostered' with red styling when staffCount is 0 but children > 0", () => {
    const { container } = render(<RatioBadge staffCount={0} childrenCount={5} />);
    expect(container.textContent).toMatch(/no staff/i);
    const root = container.firstChild as HTMLElement | null;
    expect(root?.className).toMatch(/red/);
  });

  it("shows green 'within limit' for 2:20 (ratio 10:1)", () => {
    const { container } = render(<RatioBadge staffCount={2} childrenCount={20} />);
    expect(container.textContent).toMatch(/10:1/);
    expect(container.textContent).toMatch(/within limit/i);
    const root = container.firstChild as HTMLElement | null;
    expect(root?.className).toMatch(/green/);
  });

  it("shows amber 'near limit' for 1:12 (ratio 12:1, above 85% of 1:13)", () => {
    const { container } = render(<RatioBadge staffCount={1} childrenCount={12} />);
    expect(container.textContent).toMatch(/12:1/);
    expect(container.textContent).toMatch(/near limit/i);
    const root = container.firstChild as HTMLElement | null;
    expect(root?.className).toMatch(/amber/);
  });

  it("shows red 'exceeds' for 1:14 (ratio 14:1)", () => {
    const { container } = render(<RatioBadge staffCount={1} childrenCount={14} />);
    expect(container.textContent).toMatch(/14:1/);
    expect(container.textContent).toMatch(/exceeds/i);
    const root = container.firstChild as HTMLElement | null;
    expect(root?.className).toMatch(/red/);
  });

  it("applies custom className", () => {
    const { container } = render(
      <RatioBadge staffCount={1} childrenCount={10} className="extra-class" />,
    );
    const root = container.firstChild as HTMLElement | null;
    expect(root?.className).toContain("extra-class");
  });
});
