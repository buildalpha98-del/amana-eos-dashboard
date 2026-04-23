// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { BookingInput } from "@/components/services/attendance/BookingInput";

function setup(value: number) {
  const onCommit = vi.fn();
  const utils = render(
    <BookingInput
      value={value}
      onCommit={onCommit}
      ariaLabel="test booking"
    />
  );
  const input = screen.getByLabelText("test booking") as HTMLInputElement;
  return { input, onCommit, ...utils };
}

describe("BookingInput", () => {
  it("starts with the provided value rendered", () => {
    const { input } = setup(5);
    expect(input.value).toBe("5");
  });

  it("selects all text on focus so typing replaces rather than appends", () => {
    const { input } = setup(0);
    const selectSpy = vi.spyOn(input, "select");
    fireEvent.focus(input);
    expect(selectSpy).toHaveBeenCalledOnce();
  });

  it("commits the typed value on blur", () => {
    const { input, onCommit } = setup(0);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "42" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(42);
  });

  it("does not fire onCommit during typing (only on blur)", () => {
    const { input, onCommit } = setup(0);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.change(input, { target: { value: "15" } });
    fireEvent.change(input, { target: { value: "150" } });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith(150);
  });

  it("strips non-numeric characters from pasted input", () => {
    const { input, onCommit } = setup(0);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "abc12x3" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(123);
  });

  it("coerces an empty value on blur to 0", () => {
    const { input, onCommit } = setup(7);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(0);
    expect(input.value).toBe("0");
  });

  it("replaces an existing value cleanly (no leading-zero obstruction)", () => {
    const { input, onCommit } = setup(0);
    fireEvent.focus(input);
    // simulate user typing "2" — with select-on-focus this replaces "0"
    fireEvent.change(input, { target: { value: "2" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(2);
  });

  it("caps values at 999", () => {
    const { input, onCommit } = setup(0);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "9999" } });
    fireEvent.blur(input);
    // maxLength={3} prevents typing beyond 3 chars in a real browser,
    // but if 9999 slipped through we clamp.
    expect(onCommit.mock.calls[0][0]).toBeLessThanOrEqual(999);
  });

  it("does not call onCommit when the blur value matches the current value", () => {
    const { input, onCommit } = setup(5);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("syncs draft when the value prop changes", () => {
    const onCommit = vi.fn();
    const { rerender } = render(
      <BookingInput value={3} onCommit={onCommit} ariaLabel="sync test" />
    );
    const input = screen.getByLabelText("sync test") as HTMLInputElement;
    expect(input.value).toBe("3");
    rerender(
      <BookingInput value={12} onCommit={onCommit} ariaLabel="sync test" />
    );
    expect(input.value).toBe("12");
  });
});
