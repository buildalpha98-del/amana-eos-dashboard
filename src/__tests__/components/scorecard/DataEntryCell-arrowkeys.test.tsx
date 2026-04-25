// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock the create-entry mutation so the cell's save path doesn't try to fetch.
vi.mock("@/hooks/useScorecard", () => ({
  useCreateEntry: () => ({
    mutate: (_args: unknown, opts?: { onSettled?: () => void }) => {
      opts?.onSettled?.();
    },
  }),
}));

import { DataEntryCell } from "@/components/scorecard/DataEntryCell";

function renderGrid() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <table>
        <tbody>
          <tr>
            <td className="header" data-testid="row1-header">
              Measure A
            </td>
            <DataEntryCell
              measurableId="m1"
              weekOf="2026-04-20"
              entry={undefined}
              unit={null}
              goalValue={10}
              goalDirection="above"
            />
            <DataEntryCell
              measurableId="m1"
              weekOf="2026-04-13"
              entry={undefined}
              unit={null}
              goalValue={10}
              goalDirection="above"
            />
            <DataEntryCell
              measurableId="m1"
              weekOf="2026-04-06"
              entry={undefined}
              unit={null}
              goalValue={10}
              goalDirection="above"
            />
          </tr>
          <tr>
            <td className="header">Measure B</td>
            <DataEntryCell
              measurableId="m2"
              weekOf="2026-04-20"
              entry={undefined}
              unit={null}
              goalValue={5}
              goalDirection="above"
            />
            <DataEntryCell
              measurableId="m2"
              weekOf="2026-04-13"
              entry={undefined}
              unit={null}
              goalValue={5}
              goalDirection="above"
            />
            <DataEntryCell
              measurableId="m2"
              weekOf="2026-04-06"
              entry={undefined}
              unit={null}
              goalValue={5}
              goalDirection="above"
            />
          </tr>
        </tbody>
      </table>
    </QueryClientProvider>,
  );
}

describe("DataEntryCell — arrow-key navigation", () => {
  it("marks every data-entry cell with data-scorecard-cell so navigation skips header columns", () => {
    const { container } = renderGrid();
    const tagged = container.querySelectorAll("td[data-scorecard-cell]");
    // 2 rows × 3 data cells = 6 markers; the 2 "header" td cells are NOT marked
    expect(tagged.length).toBe(6);

    const headerCells = container.querySelectorAll("td.header");
    headerCells.forEach((td) => {
      expect(td.hasAttribute("data-scorecard-cell")).toBe(false);
    });
  });

  it("ArrowRight from an editing cell saves and clicks the next data-entry cell to its right", async () => {
    const { container } = renderGrid();
    const cells = container.querySelectorAll<HTMLTableCellElement>(
      "td[data-scorecard-cell]",
    );
    // Click the first data cell to enter edit mode
    fireEvent.click(cells[0]);
    const input = await screen.findByRole("spinbutton");
    expect(input).toBeTruthy();

    // Type a value, set cursor to end
    fireEvent.change(input, { target: { value: "12" } });
    // Number inputs in jsdom return null selectionStart/End — our hook
    // treats that as "always at boundary" and lets arrow keys navigate.

    // Arrow right should fire moveFocus → click the next cell
    const secondCell = cells[1];
    const clickSpy = vi.fn();
    secondCell.addEventListener("click", clickSpy);

    fireEvent.keyDown(input, { key: "ArrowRight" });

    // setTimeout(0) defers the click — flush via act + microtask
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });

    expect(clickSpy).toHaveBeenCalled();
  });

  it("ArrowDown jumps to the same column in the next row (skipping header td)", async () => {
    const { container } = renderGrid();
    const rows = container.querySelectorAll("tbody > tr");
    const row1Cells = rows[0].querySelectorAll<HTMLTableCellElement>(
      "td[data-scorecard-cell]",
    );
    const row2Cells = rows[1].querySelectorAll<HTMLTableCellElement>(
      "td[data-scorecard-cell]",
    );

    // Edit row 1, column 1 (second data cell from the left)
    fireEvent.click(row1Cells[1]);
    const input = await screen.findByRole("spinbutton");
    fireEvent.change(input, { target: { value: "42" } });
    // Number inputs in jsdom return null selectionStart/End — our hook
    // treats that as "always at boundary" and lets arrow keys navigate.

    // Click spy on the same column in row 2
    const target = row2Cells[1];
    const clickSpy = vi.fn();
    target.addEventListener("click", clickSpy);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });

    expect(clickSpy).toHaveBeenCalled();
  });

  it("ArrowLeft from an empty input (cursor at start) navigates left", async () => {
    const { container } = renderGrid();
    const cells = container.querySelectorAll<HTMLTableCellElement>(
      "td[data-scorecard-cell]",
    );
    fireEvent.click(cells[2]);
    const input = await screen.findByRole("spinbutton");
    // Empty input — number input cursor is reported as null in jsdom
    void input;

    const target = cells[1];
    const clickSpy = vi.fn();
    target.addEventListener("click", clickSpy);

    fireEvent.keyDown(input, { key: "ArrowLeft" });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });

    expect(clickSpy).toHaveBeenCalled();
  });
});
