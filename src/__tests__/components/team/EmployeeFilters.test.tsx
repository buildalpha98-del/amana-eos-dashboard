/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// EmployeeFilters now calls useEmployeeTags() for the Tag chip
// dropdown; mock the fetch so the hook returns immediately with no
// tags (so the chip stays hidden in these existing tests).
vi.mock("@/lib/fetch-api", () => ({
  fetchApi: vi.fn(() => Promise.resolve({ tags: [] })),
}));

import { EmployeeFilters, type EmployeeFiltersValue } from "@/components/team/EmployeeFilters";

function renderWithQuery(node: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

const SERVICES = [
  { id: "svc-1", name: "Mawson Lakes" },
  { id: "svc-2", name: "Port Adelaide" },
];

const EMPTY: EmployeeFiltersValue = {
  q: "",
  status: null,
  serviceIds: [],
  roles: [],
          tags: [],
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
    renderWithQuery(      <EmployeeFilters
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
    renderWithQuery(      <EmployeeFilters
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
    renderWithQuery(      <EmployeeFilters
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
    // Use a single QueryClient across the initial render + rerender
    // so the rerender call doesn't unmount the QueryClientProvider.
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { rerender } = render(
      <QueryClientProvider client={qc}>
        <EmployeeFilters
          value={EMPTY}
          onChange={onChange}
          services={SERVICES}
          viewerRole="admin"
        />
      </QueryClientProvider>,
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
      <QueryClientProvider client={qc}>
        <EmployeeFilters
          value={{ ...EMPTY, serviceIds: ["svc-1"] }}
          onChange={onChange}
          services={SERVICES}
          viewerRole="admin"
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Port Adelaide" }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...EMPTY,
      serviceIds: ["svc-1", "svc-2"],
    });
  });

  it("hides Deactivated status option for non-admin viewers", () => {
    const onChange = vi.fn();
    renderWithQuery(      <EmployeeFilters
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
    renderWithQuery(      <EmployeeFilters
        value={{
          q: "ali",
          status: "active",
          serviceIds: ["svc-1"],
          roles: ["staff"],
          tags: [],
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
          tags: [],
    });
  });

  it("Clear all button resets all filters", () => {
    const onChange = vi.fn();
    renderWithQuery(      <EmployeeFilters
        value={{
          q: "ali",
          status: "active",
          serviceIds: ["svc-1"],
          roles: ["staff"],
          tags: [],
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
          tags: [],
    });
  });
});
