// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ChildrenFilters } from "@/components/services/ChildrenFilters";
import type { ChildrenFilters as ChildrenFiltersType } from "@/hooks/useChildren";

function renderFilters(
  filters: ChildrenFiltersType = {},
  onChange: (next: ChildrenFiltersType) => void = () => {},
) {
  return render(<ChildrenFilters filters={filters} onChange={onChange} />);
}

describe("ChildrenFilters", () => {
  it("renders all six controls", () => {
    renderFilters();

    // Status radio group with three options
    const statusGroup = screen.getByRole("radiogroup", { name: /status filter/i });
    expect(statusGroup).toBeDefined();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);

    // Dropdowns
    expect(screen.getByLabelText(/room filter/i)).toBeDefined();
    expect(screen.getByLabelText(/day filter/i)).toBeDefined();
    expect(screen.getByLabelText(/ccs status filter/i)).toBeDefined();
    expect(screen.getByLabelText(/tags filter/i)).toBeDefined();
    expect(screen.getByLabelText(/sort by/i)).toBeDefined();
  });

  it("renders placeholder text when room/tags/ccs options are empty (disabled controls)", () => {
    renderFilters();
    const roomSelect = screen.getByLabelText(/room filter/i) as HTMLSelectElement;
    const tagsSelect = screen.getByLabelText(/tags filter/i) as HTMLSelectElement;
    const ccsSelect = screen.getByLabelText(/ccs status filter/i) as HTMLSelectElement;

    expect(roomSelect.disabled).toBe(true);
    expect(tagsSelect.disabled).toBe(true);
    expect(ccsSelect.disabled).toBe(true);
    expect(roomSelect.textContent).toMatch(/no values yet/i);
  });

  it("Clear button appears only when filters are active", () => {
    const { rerender } = renderFilters({ status: "current" });
    expect(screen.queryByRole("button", { name: /clear filters/i })).toBeNull();

    rerender(
      <ChildrenFilters
        filters={{ status: "withdrawn" }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /clear filters/i })).toBeDefined();
  });

  it("clicking Clear resets to default status but preserves serviceId + includeParents", () => {
    const spy = vi.fn();
    renderFilters(
      {
        serviceId: "svc-1",
        includeParents: true,
        status: "withdrawn",
        sortBy: "surname",
        day: "mon",
      },
      spy,
    );

    fireEvent.click(screen.getByRole("button", { name: /clear filters/i }));
    expect(spy).toHaveBeenCalledWith({
      serviceId: "svc-1",
      includeParents: true,
      status: "current",
    });
  });

  it("switching status triggers onChange with new status", () => {
    const spy = vi.fn();
    renderFilters({ status: "current" }, spy);
    fireEvent.click(screen.getByRole("radio", { name: /withdrawn/i }));
    expect(spy).toHaveBeenCalledWith({ status: "withdrawn" });
  });

  it("picking a sort option triggers onChange with the sort key", () => {
    const spy = vi.fn();
    renderFilters({}, spy);
    fireEvent.change(screen.getByLabelText(/sort by/i), {
      target: { value: "surname" },
    });
    expect(spy).toHaveBeenCalledWith({ sortBy: "surname" });
  });

  it("renders room options when provided", () => {
    render(
      <ChildrenFilters
        filters={{}}
        onChange={() => {}}
        roomOptions={["Sunshine", "Rainbow"]}
      />,
    );

    const roomSelect = screen.getByLabelText(/room filter/i) as HTMLSelectElement;
    expect(roomSelect.disabled).toBe(false);
    expect(roomSelect.textContent).toMatch(/Sunshine/);
    expect(roomSelect.textContent).toMatch(/Rainbow/);
  });

  it("picking a day triggers onChange", () => {
    const spy = vi.fn();
    renderFilters({}, spy);
    fireEvent.change(screen.getByLabelText(/day filter/i), {
      target: { value: "tue" },
    });
    expect(spy).toHaveBeenCalledWith({ day: "tue" });
  });
});

describe("ChildrenFilters — ccs / room / tags options (4b)", () => {
  const baseFilters = { serviceId: "s1", status: "current" as const };

  it("enables the Room dropdown when roomOptions are supplied", () => {
    render(
      <ChildrenFilters
        filters={baseFilters}
        onChange={() => {}}
        roomOptions={["R1", "R2"]}
      />,
    );
    const select = screen.getByLabelText("Room filter") as HTMLSelectElement;
    expect(select.disabled).toBe(false);
    expect(Array.from(select.options).map((o) => o.value)).toContain("R1");
  });

  it("shows '(no values yet)' placeholder when roomOptions empty", () => {
    render(
      <ChildrenFilters
        filters={baseFilters}
        onChange={() => {}}
        roomOptions={[]}
      />,
    );
    // Regression: 4a shipped "(n/a)"; 4b switches to "(no values yet)".
    // Scope the lookup to the Room select because CCS and Tags also render
    // their own "(no values yet)" placeholder when their option arrays are
    // empty (the default in this render).
    const roomSelect = screen.getByLabelText("Room filter");
    expect(within(roomSelect).getByText(/no values yet/i)).toBeInTheDocument();
  });

  it("enables the CCS dropdown when ccsStatusOptions are supplied", () => {
    render(
      <ChildrenFilters
        filters={baseFilters}
        onChange={() => {}}
        ccsStatusOptions={["eligible", "pending"]}
      />,
    );
    const select = screen.getByLabelText(
      "CCS status filter",
    ) as HTMLSelectElement;
    expect(select.disabled).toBe(false);
  });

  it("enables the tags multi-select when tagOptions are supplied", () => {
    render(
      <ChildrenFilters
        filters={baseFilters}
        onChange={() => {}}
        tagOptions={["siblings", "vip"]}
      />,
    );
    const select = screen.getByLabelText("Tags filter") as HTMLSelectElement;
    expect(select.disabled).toBe(false);
    expect(select.multiple).toBe(true);
  });

  it("dispatches onChange with room value on selection", () => {
    const onChange = vi.fn();
    render(
      <ChildrenFilters
        filters={baseFilters}
        onChange={onChange}
        roomOptions={["R1", "R2"]}
      />,
    );
    fireEvent.change(screen.getByLabelText("Room filter"), {
      target: { value: "R1" },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ room: "R1" }),
    );
  });
});
