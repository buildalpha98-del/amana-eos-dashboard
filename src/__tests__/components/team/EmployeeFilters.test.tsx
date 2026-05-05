/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { EmployeeFilters, type EmployeeFiltersValue } from "@/components/team/EmployeeFilters";

const SERVICES = [
  { id: "svc-1", name: "Mawson Lakes" },
  { id: "svc-2", name: "Port Adelaide" },
];

const EMPTY: EmployeeFiltersValue = {
  q: "",
  status: null,
  serviceIds: [],
  roles: [],
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("EmployeeFilters", () => {
  it("renders search input + status/service/role triggers", () => {
    const onChange = vi.fn();
    render(
      <EmployeeFilters
        value={EMPTY}
        onChange={onChange}
        services={SERVICES}
        viewerRole="admin"
      />,
    );
    expect(screen.getByLabelText(/Search employees/i)).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Service")).toBeInTheDocument();
    expect(screen.getByText("Role")).toBeInTheDocument();
  });

  it("debounces search input ~300ms before firing onChange", () => {
    const onChange = vi.fn();
    render(
      <EmployeeFilters
        value={EMPTY}
        onChange={onChange}
        services={SERVICES}
        viewerRole="admin"
      />,
    );
    fireEvent.change(screen.getByLabelText(/Search employees/i), {
      target: { value: "ali" },
    });
    expect(onChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY, q: "ali" });
  });

  it("clicking a status option fires onChange with that status (single-select)", () => {
    const onChange = vi.fn();
    render(
      <EmployeeFilters
        value={EMPTY}
        onChange={onChange}
        services={SERVICES}
        viewerRole="admin"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Status filter/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Active" }));
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY, status: "active" });
  });

  it("clicking service options accumulates multi-select selections", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <EmployeeFilters
        value={EMPTY}
        onChange={onChange}
        services={SERVICES}
        viewerRole="admin"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Service filter/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Mawson Lakes" }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...EMPTY,
      serviceIds: ["svc-1"],
    });

    // Simulate parent feeding the new value back. Menu stays open
    // (multi-select doesn't auto-close), so the next menuitem click
    // accumulates onto the existing selection.
    rerender(
      <EmployeeFilters
        value={{ ...EMPTY, serviceIds: ["svc-1"] }}
        onChange={onChange}
        services={SERVICES}
        viewerRole="admin"
      />,
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Port Adelaide" }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...EMPTY,
      serviceIds: ["svc-1", "svc-2"],
    });
  });

  it("hides Deactivated status option for non-admin viewers", () => {
    const onChange = vi.fn();
    render(
      <EmployeeFilters
        value={EMPTY}
        onChange={onChange}
        services={SERVICES}
        viewerRole="member"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Status filter/i }));
    expect(
      screen.queryByRole("menuitem", { name: "Deactivated" }),
    ).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Active" })).toBeInTheDocument();
  });

  it("renders active-filters strip with chips that clear individual filters", () => {
    const onChange = vi.fn();
    render(
      <EmployeeFilters
        value={{
          q: "ali",
          status: "active",
          serviceIds: ["svc-1"],
          roles: ["staff"],
        }}
        onChange={onChange}
        services={SERVICES}
        viewerRole="admin"
      />,
    );
    const strip = screen.getByTestId("active-filters-strip");
    expect(strip).toBeInTheDocument();
    expect(screen.getByText('"ali"')).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Mawson Lakes")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Clear "ali"/));
    expect(onChange).toHaveBeenLastCalledWith({
      q: "",
      status: "active",
      serviceIds: ["svc-1"],
      roles: ["staff"],
    });
  });

  it("Clear all button resets all filters", () => {
    const onChange = vi.fn();
    render(
      <EmployeeFilters
        value={{
          q: "ali",
          status: "active",
          serviceIds: ["svc-1"],
          roles: ["staff"],
        }}
        onChange={onChange}
        services={SERVICES}
        viewerRole="admin"
      />,
    );
    fireEvent.click(screen.getByText("Clear all"));
    expect(onChange).toHaveBeenLastCalledWith({
      q: "",
      status: null,
      serviceIds: [],
      roles: [],
    });
  });
});
