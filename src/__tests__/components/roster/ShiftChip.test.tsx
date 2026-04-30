// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { ShiftChip } from "@/components/roster/ShiftChip";

const baseShift = {
  id: "shift-1",
  userId: "user-1",
  staffName: "Jane Doe",
  shiftStart: "07:00",
  shiftEnd: "09:00",
  sessionType: "bsc",
  role: null as string | null,
  status: "published" as const,
};

describe("ShiftChip", () => {
  it("renders staff name and time range", () => {
    const { container } = render(<ShiftChip shift={baseShift} />);
    expect(container.textContent).toContain("Jane Doe");
    expect(container.textContent).toContain("07:00");
    expect(container.textContent).toContain("09:00");
  });

  it("renders role when present", () => {
    const { container } = render(
      <ShiftChip shift={{ ...baseShift, role: "Lead Educator" }} />,
    );
    expect(container.textContent).toContain("Lead Educator");
  });

  it("omits role when null", () => {
    const { container } = render(
      <ShiftChip shift={{ ...baseShift, role: null }} />,
    );
    expect(container.textContent).not.toContain("Lead Educator");
  });

  it("applies distinct classes per session type", () => {
    const { container: bsc } = render(<ShiftChip shift={{ ...baseShift, sessionType: "bsc" }} />);
    const { container: asc } = render(<ShiftChip shift={{ ...baseShift, sessionType: "asc" }} />);
    const { container: vc } = render(<ShiftChip shift={{ ...baseShift, sessionType: "vc" }} />);
    const { container: other } = render(<ShiftChip shift={{ ...baseShift, sessionType: "xx" }} />);

    const bscClass = (bsc.firstChild as HTMLElement | null)?.className ?? "";
    const ascClass = (asc.firstChild as HTMLElement | null)?.className ?? "";
    const vcClass = (vc.firstChild as HTMLElement | null)?.className ?? "";
    const otherClass = (other.firstChild as HTMLElement | null)?.className ?? "";

    // BSC = blue, ASC = green, VC = purple, other = gray
    expect(bscClass).toMatch(/blue/);
    expect(ascClass).toMatch(/green/);
    expect(vcClass).toMatch(/purple/);
    expect(otherClass).toMatch(/gray/);

    // and they are not identical
    expect(bscClass).not.toBe(ascClass);
    expect(ascClass).not.toBe(vcClass);
  });

  it("applies dashed border when status is draft", () => {
    const { container } = render(
      <ShiftChip shift={{ ...baseShift, status: "draft" }} />,
    );
    const root = container.firstChild as HTMLElement | null;
    expect(root?.className).toMatch(/border-dashed/);
  });

  it("applies solid border when status is published", () => {
    const { container } = render(
      <ShiftChip shift={{ ...baseShift, status: "published" }} />,
    );
    const root = container.firstChild as HTMLElement | null;
    expect(root?.className).not.toMatch(/border-dashed/);
  });

  it("calls onClick with the shift when clicked", () => {
    const onClick = vi.fn();
    const { container } = render(<ShiftChip shift={baseShift} onClick={onClick} />);
    const root = container.firstChild as HTMLElement;
    fireEvent.click(root);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(baseShift);
  });

  it("shows '⋯' menu trigger when currentUserId matches shift.userId and onRequestSwap is provided", () => {
    const onRequestSwap = vi.fn();
    const { getByLabelText } = render(
      <ShiftChip
        shift={baseShift}
        currentUserId="user-1"
        onRequestSwap={onRequestSwap}
      />,
    );
    const trigger = getByLabelText(/request swap/i);
    expect(trigger).toBeDefined();
    fireEvent.click(trigger);
    expect(onRequestSwap).toHaveBeenCalledWith(baseShift);
  });

  it("hides '⋯' menu when currentUserId does not match shift.userId", () => {
    const onRequestSwap = vi.fn();
    const { queryByLabelText } = render(
      <ShiftChip
        shift={baseShift}
        currentUserId="user-999"
        onRequestSwap={onRequestSwap}
      />,
    );
    expect(queryByLabelText(/request swap/i)).toBeNull();
  });

  it("hides '⋯' menu when onRequestSwap is not provided", () => {
    const { queryByLabelText } = render(
      <ShiftChip shift={baseShift} currentUserId="user-1" />,
    );
    expect(queryByLabelText(/request swap/i)).toBeNull();
  });

  it("hides '⋯' menu when currentUserId is undefined", () => {
    const onRequestSwap = vi.fn();
    const { queryByLabelText } = render(
      <ShiftChip shift={baseShift} onRequestSwap={onRequestSwap} />,
    );
    expect(queryByLabelText(/request swap/i)).toBeNull();
  });

  it("'⋯' click does not bubble to onClick", () => {
    const onClick = vi.fn();
    const onRequestSwap = vi.fn();
    const { getByLabelText } = render(
      <ShiftChip
        shift={baseShift}
        onClick={onClick}
        currentUserId="user-1"
        onRequestSwap={onRequestSwap}
      />,
    );
    fireEvent.click(getByLabelText(/request swap/i));
    expect(onRequestSwap).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });
});
