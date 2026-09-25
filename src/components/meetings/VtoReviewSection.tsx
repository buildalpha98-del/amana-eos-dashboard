"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Plus } from "lucide-react";
import type { VTOData } from "@/hooks/useVTO";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

interface VtoField {
  key: string;
  label: string;
  blank: boolean;
}

function defaultDueDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().split("T")[0];
}

function isBlankText(v: string | null | undefined): boolean {
  return !v || v.trim().length === 0;
}

/**
 * Quarterly Pulse — step 3, "V/TO Review" (20 min). Reads the V/TO section
 * by section and flags anything blank, so the room can assign an owner +
 * date to fill it rather than the gap quietly persisting to next quarter.
 * `sectionLabels` (custom section titles, same field the Vision page
 * honours) overrides the default label where set.
 */
export function VtoReviewSection({
  vto,
  users,
  onCreateTodo,
  isCompleted,
}: {
  vto: VTOData | undefined;
  users: { id: string; name: string }[] | undefined;
  onCreateTodo?: (data: { title: string; assigneeId: string; dueDate: string }) => void;
  isCompleted?: boolean;
}) {
  const fields: VtoField[] = useMemo(() => {
    if (!vto) return [];
    const labelFor = (key: string, fallback: string) =>
      vto.sectionLabels?.[key] ?? fallback;
    return [
      { key: "coreValues", label: labelFor("coreValues", "Core Values"), blank: vto.coreValues.length === 0 },
      { key: "corePurpose", label: labelFor("corePurpose", "Core Purpose"), blank: isBlankText(vto.corePurpose) },
      { key: "coreNiche", label: labelFor("coreNiche", "Core Focus / Niche"), blank: isBlankText(vto.coreNiche) },
      { key: "tenYearTarget", label: labelFor("tenYearTarget", "10-Year Target"), blank: isBlankText(vto.tenYearTarget) },
      {
        key: "threeYear",
        label: labelFor("threeYearPicture", "3-Year Picture"),
        blank:
          isBlankText(vto.threeYearPicture) &&
          isBlankText(vto.threeYearRevenue) &&
          isBlankText(vto.threeYearProfit) &&
          isBlankText(vto.threeYearMeasurables) &&
          isBlankText(vto.threeYearLooksLike),
      },
      {
        key: "oneYear",
        label: labelFor("oneYearFutureDate", "1-Year Plan"),
        blank:
          isBlankText(vto.oneYearRevenue) &&
          isBlankText(vto.oneYearProfit) &&
          isBlankText(vto.oneYearMeasurables) &&
          vto.oneYearGoals.length === 0,
      },
      {
        key: "gtm",
        label: labelFor("gtmTargetMarket", "Go to Market Strategy"),
        blank:
          isBlankText(vto.marketingStrategy) &&
          isBlankText(vto.gtmTargetMarket) &&
          isBlankText(vto.gtmThreeUniques) &&
          isBlankText(vto.gtmProvenProcess) &&
          isBlankText(vto.gtmGuarantee),
      },
    ];
  }, [vto]);

  if (!vto) {
    return (
      <div className="text-center py-12 text-muted text-sm">
        No V/TO found. Set it up on the Vision page first.
      </div>
    );
  }

  const blankFields = fields.filter((f) => f.blank);

  return (
    <div className="space-y-4">
      <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-emerald-800 mb-1">
          V/TO Review
        </h4>
        <p className="text-xs text-emerald-600">
          Read the Vision/Traction Organiser aloud section by section. For
          anything blank, assign an owner and a date to fill it in.
        </p>
      </div>

      {blankFields.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 px-4 py-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            Every section has content. Nothing to assign.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {blankFields.map((f) => (
            <BlankFieldRow
              key={f.key}
              field={f}
              users={users}
              onCreateTodo={onCreateTodo}
              disabled={isCompleted}
            />
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        {fields
          .filter((f) => !f.blank)
          .map((f) => (
            <div
              key={f.key}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
              {f.label}
            </div>
          ))}
      </div>
    </div>
  );
}

function BlankFieldRow({
  field,
  users,
  onCreateTodo,
  disabled,
}: {
  field: VtoField;
  users: { id: string; name: string }[] | undefined;
  onCreateTodo?: (data: { title: string; assigneeId: string; dueDate: string }) => void;
  disabled?: boolean;
}) {
  const [assigning, setAssigning] = useState(false);
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [requested, setRequested] = useState(false);

  const canCapture = !disabled && !!onCreateTodo;

  const handleCreate = () => {
    if (!assigneeId || !onCreateTodo) return;
    onCreateTodo({
      title: `Fill in V/TO: ${field.label}`,
      assigneeId,
      dueDate,
    });
    setRequested(true);
    setAssigning(false);
  };

  return (
    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3">
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            {field.label} is blank
          </p>
        </div>
        {requested ? (
          <span className="text-2xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-medium">
            To-do created
          </span>
        ) : canCapture ? (
          !assigning ? (
            <Button
              variant="outline"
              size="xs"
              onClick={() => setAssigning(true)}
              iconLeft={<Plus className="w-3.5 h-3.5" />}
            >
              Assign
            </Button>
          ) : null
        ) : null}
      </div>

      {assigning && canCapture && (
        <div className="flex flex-col sm:flex-row gap-2 mt-3">
          <select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            aria-label={`Owner for ${field.label}`}
            className={cn(
              "flex-1 px-2 py-1.5 text-sm border border-border rounded-lg bg-card",
              "focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand",
            )}
          >
            <option value="">Assign to…</option>
            {(users ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            aria-label={`Due date for ${field.label}`}
            className="px-2 py-1.5 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
          />
          <Button size="xs" onClick={handleCreate} disabled={!assigneeId}>
            Create To-Do
          </Button>
        </div>
      )}
    </div>
  );
}
