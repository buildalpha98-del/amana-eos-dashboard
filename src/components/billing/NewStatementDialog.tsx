"use client";

import { useState, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCreateStatement } from "@/hooks/useBilling";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LineItem {
  key: number;
  childId: string;
  date: string;
  sessionType: "bsc" | "asc" | "vc";
  description: string;
  grossFee: number;
  ccsHours: number;
  ccsRate: number;
}

function calcCcsAmount(item: LineItem) {
  return +(item.ccsHours * item.ccsRate).toFixed(2);
}

function calcGapAmount(item: LineItem) {
  return +(item.grossFee - calcCcsAmount(item)).toFixed(2);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

let lineKeyCounter = 0;

export function NewStatementDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createStatement = useCreateStatement();

  // Form state
  const [contactId, setContactId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  // Derived
  const periodEnd = periodStart
    ? new Date(new Date(periodStart).getTime() + 6 * 86400000)
        .toISOString()
        .split("T")[0]
    : "";

  const defaultDueDate = periodStart
    ? new Date(new Date(periodStart).getTime() + 14 * 86400000)
        .toISOString()
        .split("T")[0]
    : "";

  const totalGross = lineItems.reduce((s, i) => s + i.grossFee, 0);
  const totalCcs = lineItems.reduce((s, i) => s + calcCcsAmount(i), 0);
  const totalGap = lineItems.reduce((s, i) => s + calcGapAmount(i), 0);

  const addLineItem = useCallback(() => {
    setLineItems((prev) => [
      ...prev,
      {
        key: ++lineKeyCounter,
        childId: "",
        date: periodStart,
        sessionType: "asc",
        description: "",
        grossFee: 0,
        ccsHours: 0,
        ccsRate: 0,
      },
    ]);
  }, [periodStart]);

  const updateLine = useCallback(
    (key: number, patch: Partial<LineItem>) => {
      setLineItems((prev) =>
        prev.map((item) => (item.key === key ? { ...item, ...patch } : item))
      );
    },
    []
  );

  const removeLine = useCallback((key: number) => {
    setLineItems((prev) => prev.filter((item) => item.key !== key));
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createStatement.mutate(
      {
        contactId,
        serviceId,
        periodStart,
        periodEnd,
        dueDate: dueDate || defaultDueDate,
        notes: notes || undefined,
        lineItems: lineItems.map((li) => ({
          childId: li.childId,
          date: li.date,
          sessionType: li.sessionType,
          description: li.description,
          grossFee: li.grossFee,
          ccsHours: li.ccsHours,
          ccsRate: li.ccsRate,
          ccsAmount: calcCcsAmount(li),
          gapAmount: calcGapAmount(li),
        })),
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          resetForm();
        },
      }
    );
  };

  const resetForm = () => {
    setContactId("");
    setServiceId("");
    setPeriodStart("");
    setDueDate("");
    setNotes("");
    setLineItems([]);
  };

  const fmt = (n: number) => `$${n.toFixed(2)}`;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 animate-fade-in" />
        <Dialog.Content className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
          <div className="bg-card rounded-xl shadow-lg w-full max-w-3xl my-8 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <Dialog.Title className="text-lg font-heading font-semibold text-foreground">
                New Statement
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-surface transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </Dialog.Close>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {/* Top fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Contact / Family ID">
                  <input
                    type="text"
                    required
                    value={contactId}
                    onChange={(e) => setContactId(e.target.value)}
                    placeholder="Contact ID"
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand/50"
                  />
                </Field>
                <Field label="Service ID">
                  <input
                    type="text"
                    required
                    value={serviceId}
                    onChange={(e) => setServiceId(e.target.value)}
                    placeholder="Service ID"
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand/50"
                  />
                </Field>
                <Field label="Period Start">
                  <input
                    type="date"
                    required
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand/50"
                  />
                </Field>
                <Field label="Period End">
                  <input
                    type="date"
                    readOnly
                    value={periodEnd}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand/50"
                    tabIndex={-1}
                  />
                </Field>
                <Field label="Due Date">
                  <input
                    type="date"
                    value={dueDate || defaultDueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand/50"
                  />
                </Field>
              </div>

              <Field label="Notes">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Optional notes"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand/50 resize-none"
                />
              </Field>

              {/* Line Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    Line Items
                  </h3>
                  <button
                    type="button"
                    onClick={addLineItem}
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-hover transition-colors min-h-[36px] px-2"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Line Item
                  </button>
                </div>

                {lineItems.length === 0 && (
                  <p className="text-xs text-muted py-4 text-center border border-dashed border-border rounded-lg">
                    No line items yet. Click &quot;Add Line Item&quot; above.
                  </p>
                )}

                <div className="space-y-3">
                  {lineItems.map((li) => (
                    <LineItemRow
                      key={li.key}
                      item={li}
                      onChange={(patch) => updateLine(li.key, patch)}
                      onRemove={() => removeLine(li.key)}
                    />
                  ))}
                </div>

                {/* Totals */}
                {lineItems.length > 0 && (
                  <div className="flex justify-end gap-6 mt-3 pt-3 border-t border-border text-sm">
                    <div className="text-center">
                      <p className="text-xs text-muted">Total Gross</p>
                      <p className="font-semibold text-foreground">{fmt(totalGross)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted">Total CCS</p>
                      <p className="font-semibold text-green-600">{fmt(totalCcs)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted">Total Gap</p>
                      <p className="font-semibold text-foreground">{fmt(totalGap)}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Submit */}
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={createStatement.isPending || !contactId || !serviceId || !periodStart}
                  className={cn(
                    "px-5 py-2.5 rounded-lg text-sm font-medium transition-all min-h-[44px]",
                    "bg-brand text-white hover:bg-brand-hover active:scale-[0.98]",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  {createStatement.isPending ? "Creating..." : "Create Statement"}
                </button>
              </div>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ---------------------------------------------------------------------------
// Line Item Row
// ---------------------------------------------------------------------------

function LineItemRow({
  item,
  onChange,
  onRemove,
}: {
  item: LineItem;
  onChange: (patch: Partial<LineItem>) => void;
  onRemove: () => void;
}) {
  const ccsAmount = calcCcsAmount(item);
  const gapAmount = calcGapAmount(item);

  return (
    <div className="p-3 border border-border rounded-lg bg-surface/30 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="Child ID" compact>
          <input
            type="text"
            required
            value={item.childId}
            onChange={(e) => onChange({ childId: e.target.value })}
            placeholder="Child ID"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs min-h-[36px] focus:outline-none focus:ring-2 focus:ring-brand/50"
          />
        </Field>
        <Field label="Date" compact>
          <input
            type="date"
            required
            value={item.date}
            onChange={(e) => onChange({ date: e.target.value })}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs min-h-[36px] focus:outline-none focus:ring-2 focus:ring-brand/50"
          />
        </Field>
        <Field label="Session Type" compact>
          <select
            value={item.sessionType}
            onChange={(e) =>
              onChange({ sessionType: e.target.value as LineItem["sessionType"] })
            }
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs min-h-[36px] focus:outline-none focus:ring-2 focus:ring-brand/50"
          >
            <option value="bsc">BSC</option>
            <option value="asc">ASC</option>
            <option value="vc">VAC</option>
          </select>
        </Field>
        <Field label="Description" compact>
          <input
            type="text"
            value={item.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Description"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs min-h-[36px] focus:outline-none focus:ring-2 focus:ring-brand/50"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
        <Field label="Gross Fee" compact>
          <input
            type="number"
            min={0}
            step={0.01}
            value={item.grossFee || ""}
            onChange={(e) => onChange({ grossFee: +e.target.value })}
            placeholder="0.00"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs min-h-[36px] focus:outline-none focus:ring-2 focus:ring-brand/50"
          />
        </Field>
        <Field label="CCS Hours" compact>
          <input
            type="number"
            min={0}
            step={0.01}
            value={item.ccsHours || ""}
            onChange={(e) => onChange({ ccsHours: +e.target.value })}
            placeholder="0"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs min-h-[36px] focus:outline-none focus:ring-2 focus:ring-brand/50"
          />
        </Field>
        <Field label="CCS Rate" compact>
          <input
            type="number"
            min={0}
            step={0.01}
            value={item.ccsRate || ""}
            onChange={(e) => onChange({ ccsRate: +e.target.value })}
            placeholder="0.00"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs min-h-[36px] focus:outline-none focus:ring-2 focus:ring-brand/50"
          />
        </Field>
        <div className="text-xs">
          <p className="text-muted mb-1">CCS: <span className="font-semibold text-green-600">${ccsAmount.toFixed(2)}</span></p>
          <p className="text-muted">Gap: <span className="font-semibold text-foreground">${gapAmount.toFixed(2)}</span></p>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onRemove}
            className="p-2 rounded-lg text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
            aria-label="Remove line item"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field helper
// ---------------------------------------------------------------------------

function Field({
  label,
  children,
  compact,
}: {
  label: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <label className="block">
      <span className={cn("block font-medium text-muted mb-1", compact ? "text-[10px]" : "text-xs")}>
        {label}
      </span>
      {children}
    </label>
  );
}
