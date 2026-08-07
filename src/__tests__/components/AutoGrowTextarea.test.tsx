// @vitest-environment jsdom
/**
 * The box that grows to fit its notes.
 *
 * Exists because during an L10 these notes get read aloud off a shared
 * screen — a fixed four-line box means one person scrolls inside it
 * while everyone else watches two lines at a time.
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AutoGrowTextarea } from "@/components/ui/AutoGrowTextarea";

/**
 * jsdom reports scrollHeight as 0 for everything, so the component would
 * always clamp to minHeight and prove nothing. Stub it per test to stand
 * in for "this much content".
 */
function withScrollHeight(px: number) {
  Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", {
    configurable: true,
    get: () => px,
  });
}

describe("AutoGrowTextarea", () => {
  it("opens at the minimum height when it's empty", () => {
    withScrollHeight(0);
    render(<AutoGrowTextarea aria-label="Notes" minHeight={180} />);
    const el = screen.getByLabelText("Notes") as HTMLTextAreaElement;
    expect(el.style.height).toBe("180px");
  });

  it("grows past the minimum to fit longer notes", () => {
    withScrollHeight(420);
    render(<AutoGrowTextarea aria-label="Notes" minHeight={180} />);
    const el = screen.getByLabelText("Notes") as HTMLTextAreaElement;
    expect(el.style.height).toBe("420px");
    // Nothing hidden behind an inner scrollbar — that's the whole point.
    expect(el.style.overflowY).toBe("hidden");
  });

  it("stops at the cap and scrolls instead", () => {
    // Without a ceiling a pasted essay pushes the buttons under it off
    // the screen.
    withScrollHeight(5000);
    render(<AutoGrowTextarea aria-label="Notes" maxHeight={600} />);
    const el = screen.getByLabelText("Notes") as HTMLTextAreaElement;
    expect(el.style.height).toBe("600px");
    expect(el.style.overflowY).toBe("auto");
  });

  it("re-measures as you type, and still calls onChange", () => {
    withScrollHeight(200);
    const onChange = vi.fn();
    render(
      <AutoGrowTextarea aria-label="Notes" minHeight={100} onChange={onChange} />,
    );
    const el = screen.getByLabelText("Notes") as HTMLTextAreaElement;
    expect(el.style.height).toBe("200px");

    withScrollHeight(340);
    fireEvent.change(el, { target: { value: "more notes" } });

    expect(el.style.height).toBe("340px");
    // The caller's handler must still run — this wraps behaviour, it
    // doesn't replace it.
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("stays manually resizable", () => {
    withScrollHeight(0);
    render(<AutoGrowTextarea aria-label="Notes" />);
    // Growing is the default, not a cage: anyone who wants a specific
    // size can still drag one.
    expect(screen.getByLabelText("Notes").className).toContain("resize-y");
  });
});
