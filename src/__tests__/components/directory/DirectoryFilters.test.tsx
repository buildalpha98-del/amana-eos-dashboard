// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import {
  DirectoryFilters,
  type DirectoryFiltersValue,
} from "@/components/directory/DirectoryFilters";

const SERVICES = [
  { id: "svc-1", name: "Parramatta" },
  { id: "svc-2", name: "Bankstown" },
];

const EMPTY: DirectoryFiltersValue = { q: "", service: "", role: "" };

describe("DirectoryFilters", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders search input and service dropdown", () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <DirectoryFilters
        value={EMPTY}
        onChange={onChange}
        services={SERVICES}
        showRoleFilter={false}
      />,
    );
    expect(getByLabelText("Search staff by name")).toBeTruthy();
    expect(getByLabelText("Filter by service")).toBeTruthy();
  });

  it("hides role dropdown when showRoleFilter=false", () => {
    const { queryByLabelText } = render(
      <DirectoryFilters
        value={EMPTY}
        onChange={vi.fn()}
        services={SERVICES}
        showRoleFilter={false}
      />,
    );
    expect(queryByLabelText("Filter by role")).toBeNull();
  });

  it("shows role dropdown when showRoleFilter=true", () => {
    const { getByLabelText } = render(
      <DirectoryFilters
        value={EMPTY}
        onChange={vi.fn()}
        services={SERVICES}
        showRoleFilter={true}
      />,
    );
    expect(getByLabelText("Filter by role")).toBeTruthy();
  });

  it("debounces search input (does not call onChange before delay)", () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <DirectoryFilters
        value={EMPTY}
        onChange={onChange}
        services={SERVICES}
        showRoleFilter={false}
        debounceMs={250}
      />,
    );
    const input = getByLabelText("Search staff by name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "jan" } });
    // Before the debounce elapses the parent should not have been notified.
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onChange).not.toHaveBeenCalled();

    // After the debounce the parent receives the final value.
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ q: "jan", service: "", role: "" });
  });

  it("collapses rapid keystrokes into a single debounced call", () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <DirectoryFilters
        value={EMPTY}
        onChange={onChange}
        services={SERVICES}
        showRoleFilter={false}
        debounceMs={250}
      />,
    );
    const input = getByLabelText("Search staff by name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "a" } });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.change(input, { target: { value: "ab" } });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.change(input, { target: { value: "abc" } });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ q: "abc", service: "", role: "" });
  });

  it("fires onChange immediately when service dropdown changes", () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <DirectoryFilters
        value={EMPTY}
        onChange={onChange}
        services={SERVICES}
        showRoleFilter={false}
      />,
    );
    const select = getByLabelText("Filter by service") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "svc-1" } });
    expect(onChange).toHaveBeenCalledWith({ q: "", service: "svc-1", role: "" });
  });

  it("fires onChange immediately when role dropdown changes", () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <DirectoryFilters
        value={EMPTY}
        onChange={onChange}
        services={SERVICES}
        showRoleFilter={true}
      />,
    );
    const select = getByLabelText("Filter by role") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "admin" } });
    expect(onChange).toHaveBeenCalledWith({ q: "", service: "", role: "admin" });
  });

  it("shows Clear button only when a filter is set", () => {
    const { queryByText, rerender } = render(
      <DirectoryFilters
        value={EMPTY}
        onChange={vi.fn()}
        services={SERVICES}
        showRoleFilter={true}
      />,
    );
    expect(queryByText("Clear")).toBeNull();

    rerender(
      <DirectoryFilters
        value={{ q: "", service: "svc-1", role: "" }}
        onChange={vi.fn()}
        services={SERVICES}
        showRoleFilter={true}
      />,
    );
    expect(queryByText("Clear")).toBeTruthy();
  });

  it("Clear button resets all filters", () => {
    const onChange = vi.fn();
    const { getByText } = render(
      <DirectoryFilters
        value={{ q: "foo", service: "svc-1", role: "admin" }}
        onChange={onChange}
        services={SERVICES}
        showRoleFilter={true}
      />,
    );
    fireEvent.click(getByText("Clear"));
    expect(onChange).toHaveBeenCalledWith({ q: "", service: "", role: "" });
  });
});
