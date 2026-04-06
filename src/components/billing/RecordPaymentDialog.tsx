"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRecordPayment } from "@/hooks/useBilling";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecordPaymentDialog({
  statementId,
  contactId,
  serviceId,
  open,
  onOpenChange,
}: {
  statementId?: string;
  contactId: string;
  serviceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const recordPayment = useRecordPayment();

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [receivedAt, setReceivedAt] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [notes, setNotes] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    recordPayment.mutate(
      {
        statementId,
        contactId,
        serviceId,
        amount: +amount,
        method,
        reference: reference || undefined,
        receivedAt,
        notes: notes || undefined,
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
    setAmount("");
    setMethod("bank_transfer");
    setReference("");
    setReceivedAt(new Date().toISOString().split("T")[0]);
    setNotes("");
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 animate-fade-in" />
        <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-lg w-full max-w-md animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <Dialog.Title className="text-lg font-heading font-semibold text-foreground">
                Record Payment
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
              <label className="block">
                <span className="block text-xs font-medium text-muted mb-1">
                  Amount
                </span>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand/50"
                />
              </label>

              <label className="block">
                <span className="block text-xs font-medium text-muted mb-1">
                  Payment Method
                </span>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand/50"
                >
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="direct_debit">Direct Debit</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label className="block">
                <span className="block text-xs font-medium text-muted mb-1">
                  Reference
                </span>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Optional reference"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand/50"
                />
              </label>

              <label className="block">
                <span className="block text-xs font-medium text-muted mb-1">
                  Date Received
                </span>
                <input
                  type="date"
                  required
                  value={receivedAt}
                  onChange={(e) => setReceivedAt(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand/50"
                />
              </label>

              <label className="block">
                <span className="block text-xs font-medium text-muted mb-1">
                  Notes
                </span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Optional notes"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand/50 resize-none"
                />
              </label>

              {/* Submit */}
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={recordPayment.isPending || !amount}
                  className={cn(
                    "px-5 py-2.5 rounded-lg text-sm font-medium transition-all min-h-[44px]",
                    "bg-brand text-white hover:bg-brand-hover active:scale-[0.98]",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  {recordPayment.isPending ? "Recording..." : "Record Payment"}
                </button>
              </div>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
