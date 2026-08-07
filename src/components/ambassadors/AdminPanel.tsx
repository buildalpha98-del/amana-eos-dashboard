"use client";

import { useState } from "react";
import { Download, FileUp, Play, Square } from "lucide-react";
import {
  usePayrollAction,
  usePayrollPreview,
  usePilotOverview,
  useUpdatePilot,
} from "@/hooks/useAmbassadors";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { ImportWizard } from "@/components/import/ImportWizard";

/**
 * Pilot administration: activate/close, targets, weekly OWNA attendance
 * CSV import, and the payroll export flow (preview → CSV → send → paid).
 * Payroll actions are admin/owner; pilot config is head_office/owner.
 */
export function AdminPanel({ role }: { role: string }) {
  const { data, isLoading } = usePilotOverview();
  const updatePilot = useUpdatePilot();
  const payroll = usePayrollAction();
  const [showImport, setShowImport] = useState(false);
  const preview = usePayrollPreview(true);

  const canConfigure = role === "owner" || role === "head_office";
  const canPayroll = role === "owner" || role === "admin";

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  const pilot = data?.pilot;
  if (!pilot) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center text-sm text-muted">
        No pilot exists — the deploy seed creates one; check back shortly.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pilot control */}
      {canConfigure && (
        <div className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Pilot control</h2>
          <p className="text-sm text-muted">
            {pilot.status === "draft" &&
              "The pilot is set up but not live — activating it starts logging new enrolments at the pilot centres."}
            {pilot.status === "active" &&
              "The pilot is live. Closing stops NEW enrolments being logged; verification and approval of existing records continues."}
            {pilot.status === "closed" && "The pilot is closed."}
          </p>
          <div className="flex gap-2">
            {pilot.status === "draft" && (
              <Button
                size="sm"
                disabled={updatePilot.isPending}
                onClick={() => updatePilot.mutate({ action: "activate" })}
              >
                <Play className="w-3.5 h-3.5" /> Activate pilot
              </Button>
            )}
            {pilot.status === "active" && (
              <Button
                size="sm"
                variant="destructive"
                disabled={updatePilot.isPending}
                onClick={() => {
                  if (window.confirm("Close the pilot? New enrolments will stop being logged.")) {
                    updatePilot.mutate({ action: "close" });
                  }
                }}
              >
                <Square className="w-3.5 h-3.5" /> Close pilot
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Attendance import */}
      <div className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">
          OWNA attendance import
        </h2>
        <p className="text-sm text-muted">
          Attendance lives in OWNA. Upload the weekly attendance export
          (CSV/XLSX with child name, date and fee columns) — sessions are
          matched to open ambassador records and counts recompute
          automatically. $0 rows are kept but never count as paid sessions.
        </p>
        <Button size="sm" variant="outline" onClick={() => setShowImport(true)}>
          <FileUp className="w-3.5 h-3.5" /> Import attendance
        </Button>
      </div>

      {/* Payroll */}
      {canPayroll && (
        <div className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Payroll export</h2>
          {preview.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              {(preview.data?.groups.length ?? 0) === 0 ? (
                <p className="text-sm text-muted">
                  Nothing approved and payable right now.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-2xs uppercase tracking-wide text-muted border-b border-border">
                        <th className="py-2 pr-3">Educator</th>
                        <th className="py-2 pr-3">Employee ID</th>
                        <th className="py-2 pr-3">Count</th>
                        <th className="py-2 pr-3">Gross</th>
                        <th className="py-2 pr-3">Kicker</th>
                        <th className="py-2">Super (12%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {preview.data!.groups.map((g) => (
                        <tr key={g.name}>
                          <td className="py-2 pr-3 text-foreground">{g.name}</td>
                          <td className="py-2 pr-3 text-muted">
                            {g.employeeId ?? "—"}
                          </td>
                          <td className="py-2 pr-3 tabular-nums">{g.count}</td>
                          <td className="py-2 pr-3 tabular-nums">
                            ${g.gross.toFixed(2)}
                          </td>
                          <td className="py-2 pr-3 tabular-nums">
                            ${g.kicker.toFixed(2)}
                          </td>
                          <td className="py-2 tabular-nums">
                            ${g.superAmount.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {(preview.data?.held.length ?? 0) > 0 && (
                <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg p-3 text-sm text-amber-900 dark:text-amber-200">
                  Held back (Amana Ambassadors course not completed):{" "}
                  {preview
                    .data!.held.map((h) => `${h.name} (${h.recordCount})`)
                    .join(", ")}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    window.open("/api/ambassadors/payroll-export", "_blank");
                  }}
                >
                  <Download className="w-3.5 h-3.5" /> Download CSV
                </Button>
                <Button
                  size="sm"
                  disabled={
                    payroll.isPending || (preview.data?.groups.length ?? 0) === 0
                  }
                  onClick={() => {
                    if (
                      window.confirm(
                        "Send these records to payroll? They'll be locked from further edits.",
                      )
                    ) {
                      payroll.mutate(
                        { action: "send" },
                        { onSuccess: () => preview.refetch() },
                      );
                    }
                  }}
                >
                  Send to payroll
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={payroll.isPending}
                  onClick={() => {
                    if (window.confirm("Mark everything sent to payroll as paid?")) {
                      payroll.mutate({ action: "mark-paid" });
                    }
                  }}
                >
                  Mark paid
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {showImport && (
        <ImportWizard
          title="OWNA attendance import"
          endpoint="/api/ambassadors/attendance-import"
          columnConfig={[
            { key: "childName", label: "Child name", required: true },
            { key: "date", label: "Date", required: true },
            { key: "fee", label: "Fee", required: true },
            { key: "sessionType", label: "Session" },
            { key: "dob", label: "Date of birth" },
          ]}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}
