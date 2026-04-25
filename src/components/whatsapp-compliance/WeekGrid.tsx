"use client";

import { useState } from "react";
import type { GridCell, GridCentre, GridResponse } from "@/hooks/useWhatsAppCompliance";
import { CellEditPopover } from "./CellEditPopover";
import { Flag } from "lucide-react";

interface WeekGridProps {
  grid: GridResponse;
  flaggedServiceIds: Set<string>;
  onOpenHistory: (serviceId: string) => void;
}

function CellGlyph({ cell }: { cell: GridCell }) {
  if (!cell.record) {
    return <span className="text-muted" aria-label="Not yet checked">—</span>;
  }
  if (cell.record.posted) {
    return <span className="text-green-700 font-semibold" aria-label="Posted">✓</span>;
  }
  return <span className="text-red-700 font-semibold" aria-label="Did not post">✗</span>;
}

export function WeekGrid({ grid, flaggedServiceIds, onOpenHistory }: WeekGridProps) {
  const [editingCell, setEditingCell] = useState<{ centre: GridCentre; cell: GridCell } | null>(null);

  const cellByKey = new Map(grid.cells.map((c) => [`${c.serviceId}__${c.date}`, c]));

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <header className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="text-sm font-semibold">7-Day Grid (Mon–Fri)</h3>
        <span className="text-xs text-muted">
          {grid.summary.cellsChecked}/{grid.summary.totalCells} cells checked ({grid.summary.coverage}%)
        </span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface">
            <tr>
              <th className="text-left p-3 font-medium text-muted">Centre</th>
              {grid.days.map((d) => (
                <th key={d.date} className="p-3 text-center font-medium text-muted">
                  <div>{d.dayLabel}</div>
                  <div className="text-[10px] font-normal">{d.date.slice(5)}</div>
                </th>
              ))}
              <th className="p-3 text-right font-medium text-muted w-8"></th>
            </tr>
          </thead>
          <tbody>
            {grid.centres.map((centre) => {
              const flagged = flaggedServiceIds.has(centre.id);
              return (
                <tr key={centre.id} className="border-t border-border hover:bg-surface/50">
                  <td className="p-3 align-top">
                    <button
                      onClick={() => onOpenHistory(centre.id)}
                      className="text-left hover:underline"
                    >
                      <div className="font-medium text-foreground">{centre.name}</div>
                      {centre.coordinatorName && (
                        <div className="text-xs text-muted">{centre.coordinatorName}</div>
                      )}
                    </button>
                  </td>
                  {grid.days.map((d) => {
                    const cell = cellByKey.get(`${centre.id}__${d.date}`);
                    if (!cell) return <td key={d.date} className="p-3 text-center">—</td>;
                    return (
                      <td key={d.date} className="p-3 text-center">
                        <button
                          onClick={() => setEditingCell({ centre, cell })}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-surface focus:outline-none focus:ring-2 focus:ring-brand/40"
                          title={cell.record ? `Recorded by ${cell.record.recordedByName}` : "Not yet checked"}
                          aria-label={`Edit ${centre.name} on ${d.date}`}
                        >
                          <CellGlyph cell={cell} />
                        </button>
                      </td>
                    );
                  })}
                  <td className="p-3 text-right">
                    {flagged && (
                      <span
                        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-700"
                        title="Two-week pattern flagged"
                        aria-label="Two-week pattern flagged"
                      >
                        <Flag className="w-3 h-3" />
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <footer className="p-3 text-xs text-muted border-t border-border">
        Legend:{" "}
        <span className="text-green-700 font-semibold">✓</span> posted ·{" "}
        <span className="text-red-700 font-semibold">✗</span> didn&apos;t post · — not checked yet
      </footer>

      {editingCell && (
        <CellEditPopover
          centre={editingCell.centre}
          cell={editingCell.cell}
          onClose={() => setEditingCell(null)}
        />
      )}
    </section>
  );
}
