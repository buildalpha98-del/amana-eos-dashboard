// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { SwipeActions } from "@/components/ui/v2";

describe("SwipeActions", () => {
  it("renders children", () => {
    const { getByText } = render(
      <SwipeActions actions={[{ label: "Cancel", onPress: () => {} }]}>
        <div>item</div>
      </SwipeActions>,
    );
    expect(getByText("item")).toBeInTheDocument();
  });

  it("invokes action onPress when tapped", () => {
    const onPress = vi.fn();
    const { getByText } = render(
      <SwipeActions actions={[{ label: "Cancel", onPress }]}>
        <div>item</div>
      </SwipeActions>,
    );
    fireEvent.click(getByText("Cancel"));
    expect(onPress).toHaveBeenCalled();
  });

  it("starts with inner row at 0px (no drag applied)", () => {
    const { container } = render(
      <SwipeActions actions={[{ label: "X", onPress: () => {} }]}>
        <div>item</div>
      </SwipeActions>,
    );
    const row = container.firstChild as HTMLElement;
    const inner = row.firstChild as HTMLElement;
    expect(inner.style.transform).toBe("translateX(0px)");
  });

  it("positions action panel off-screen when no drag", () => {
    const { container } = render(
      <SwipeActions actions={[{ label: "X", onPress: () => {} }]} actionWidth={80}>
        <div>item</div>
      </SwipeActions>,
    );
    const row = container.firstChild as HTMLElement;
    const actionPanel = row.children[1] as HTMLElement;
    // Action panel should be translated fully off-screen to the right (width 80, offset 0)
    expect(actionPanel.style.transform).toBe("translateX(80px)");
  });

  it("pointer events do not throw even when jsdom lacks clientX", () => {
    const { container } = render(
      <SwipeActions actions={[{ label: "X", onPress: () => {} }]}>
        <div>item</div>
      </SwipeActions>,
    );
    const row = container.firstChild as HTMLElement;
    expect(() => {
      fireEvent.pointerDown(row, { pointerId: 1 });
      fireEvent.pointerMove(row, { pointerId: 1 });
      fireEvent.pointerUp(row, { pointerId: 1 });
    }).not.toThrow();
  });
});
