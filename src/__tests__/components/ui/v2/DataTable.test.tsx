// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { DataTable, type ColumnDef } from "@/components/ui/v2/DataTable";

// @tanstack/react-virtual reads element dimensions to decide what to render.
// jsdom returns 0 for every size, so no rows render by default. Stub the
// scroll element's size to a reasonable desktop value so the virtualizer
// populates its visible window.
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    value: 400,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    value: 800,
  });
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 800,
      bottom: 400,
      width: 800,
      height: 400,
      toJSON: () => ({}),
    } as DOMRect);
});

interface Row {
  id: string;
  name: string;
  count: number;
}

const rows: Row[] = [
  { id: "1", name: "Alice", count: 10 },
  { id: "2", name: "Bob", count: 25 },
  { id: "3", name: "Carol", count: 5 },
];

const columns: ColumnDef<Row>[] = [
  { key: "name", header: "Name", cell: (r) => r.name, sortable: true },
  { key: "count", header: "Count", cell: (r) => r.count, sortable: true },
];

describe("DataTable", () => {
  it("renders all rows with headers", () => {
    const { getByText } = render(
      <DataTable rows={rows} columns={columns} getRowId={(r) => r.id} />,
    );
    expect(getByText("Alice")).toBeInTheDocument();
    expect(getByText("Bob")).toBeInTheDocument();
    expect(getByText("Carol")).toBeInTheDocument();
    expect(getByText("Name")).toBeInTheDocument();
  });

  it("renders empty state when no rows", () => {
    const { getByText } = render(
      <DataTable
        rows={[]}
        columns={columns}
        getRowId={(r) => r.id}
        emptyState="Nobody here"
      />,
    );
    expect(getByText("Nobody here")).toBeInTheDocument();
  });

  it("renders loading skeleton when isLoading", () => {
    const { container } = render(
      <DataTable rows={[]} columns={columns} getRowId={(r) => r.id} isLoading />,
    );
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });

  it("fires onRowAction on click", () => {
    const onRowAction = vi.fn();
    const { getByText } = render(
      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        onRowAction={onRowAction}
      />,
    );
    fireEvent.click(getByText("Bob"));
    expect(onRowAction).toHaveBeenCalledWith(rows[1]);
  });

  it("renders selectable checkboxes when selectable=true", () => {
    const { container } = render(
      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        selectable
      />,
    );
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBe(3);
  });

  it("reports selection via onSelectionChange when toggled", () => {
    const onSelectionChange = vi.fn();
    const { container } = render(
      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        selectable
        onSelectionChange={onSelectionChange}
      />,
    );
    const first = container.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    fireEvent.click(first);
    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    const ids = onSelectionChange.mock.calls[0][0] as Set<string>;
    expect(ids.has("1")).toBe(true);
  });

  it("toggles sort direction when header clicked", () => {
    const { container, getByText } = render(
      <DataTable rows={rows} columns={columns} getRowId={(r) => r.id} />,
    );
    const header = getByText("Count");
    fireEvent.click(header); // asc
    let firstCell = container.querySelectorAll('[role="cell"]')[0];
    // After asc sort, Carol (count=5) is first
    expect(firstCell?.textContent).toContain("Carol");
    fireEvent.click(header); // desc
    firstCell = container.querySelectorAll('[role="cell"]')[0];
    // After desc sort, Bob (count=25) is first
    expect(firstCell?.textContent).toContain("Bob");
  });

  it("supports controlled selection via selectedIds prop", () => {
    const onSelectionChange = vi.fn();
    const { rerender, container } = render(
      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        selectable
        selectedIds={new Set(["2"])}
        onSelectionChange={onSelectionChange}
      />,
    );
    const checkboxes = container.querySelectorAll(
      'input[type="checkbox"]',
    ) as NodeListOf<HTMLInputElement>;
    expect(checkboxes[1].checked).toBe(true);
    expect(checkboxes[0].checked).toBe(false);

    // External update propagates
    rerender(
      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        selectable
        selectedIds={new Set(["1", "2"])}
        onSelectionChange={onSelectionChange}
      />,
    );
    expect(checkboxes[0].checked).toBe(true);
  });
});
