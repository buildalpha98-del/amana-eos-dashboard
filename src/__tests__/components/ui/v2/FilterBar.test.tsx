// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterBar, type FilterDef } from "@/components/ui/v2/FilterBar";

const statusFilter: FilterDef = {
  key: "status",
  label: "Status",
  options: [
    { value: "all", label: "All statuses" },
    { value: "open", label: "Open" },
    { value: "done", label: "Done" },
  ],
};

const serviceFilter: FilterDef = {
  key: "service",
  label: "Service",
  options: [
    { value: "all", label: "All services" },
    { value: "s1", label: "Cessnock" },
    { value: "s2", label: "Singleton" },
  ],
};

describe("FilterBar", () => {
  it("renders search input when a search prop is provided", () => {
    render(
      <FilterBar
        search={{ value: "", onChange: () => {}, placeholder: "Search todos" }}
      />,
    );
    expect(screen.getByLabelText("Search todos")).toBeTruthy();
  });

  it("does not render search input when search prop omitted", () => {
    render(<FilterBar filters={[statusFilter]} />);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("renders a dropdown per filter def", () => {
    render(
      <FilterBar filters={[statusFilter, serviceFilter]} values={{ status: "all", service: "all" }} />,
    );
    expect(screen.getByLabelText("Status")).toBeTruthy();
    expect(screen.getByLabelText("Service")).toBeTruthy();
  });

  it("fires onChange when a dropdown value changes", () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        filters={[statusFilter]}
        values={{ status: "all" }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "open" } });
    expect(onChange).toHaveBeenCalledWith("status", "open");
  });

  it("fires onChange when search input changes", () => {
    const onSearch = vi.fn();
    render(
      <FilterBar
        search={{ value: "", onChange: onSearch, placeholder: "Search" }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "rock" } });
    expect(onSearch).toHaveBeenCalledWith("rock");
  });

  it("shows Clear button only when a filter is non-default", () => {
    const { rerender } = render(
      <FilterBar
        filters={[statusFilter]}
        values={{ status: "all" }}
        onReset={() => {}}
      />,
    );
    expect(screen.queryByText(/clear/i)).toBeNull();

    rerender(
      <FilterBar
        filters={[statusFilter]}
        values={{ status: "open" }}
        onReset={() => {}}
      />,
    );
    expect(screen.getByText(/clear/i)).toBeTruthy();
    // Count badge shows 1 active filter
    expect(screen.getByText("(1)")).toBeTruthy();
  });

  it("fires onReset when Clear is clicked", () => {
    const onReset = vi.fn();
    render(
      <FilterBar
        filters={[statusFilter]}
        values={{ status: "open" }}
        onReset={onReset}
      />,
    );
    fireEvent.click(screen.getByText(/clear/i));
    expect(onReset).toHaveBeenCalled();
  });

  it("renders leading + trailing slots", () => {
    render(
      <FilterBar
        leading={<div data-testid="lead">L</div>}
        trailing={<div data-testid="trail">T</div>}
      />,
    );
    expect(screen.getByTestId("lead")).toBeTruthy();
    expect(screen.getByTestId("trail")).toBeTruthy();
  });

  it("counts multiple active filters", () => {
    render(
      <FilterBar
        filters={[statusFilter, serviceFilter]}
        values={{ status: "open", service: "s1" }}
        onReset={() => {}}
      />,
    );
    expect(screen.getByText("(2)")).toBeTruthy();
  });
});
