"use client";
import { useState } from "react";
import { useMarkReferralPaid, type Referral } from "@/hooks/useRecruitment";
import { X } from "lucide-react";

interface Props {
  referral: Referral;
  onClose: () => void;
}

export function MarkReferralPaidModal({ referral, onClose }: Props) {
  const [paidAt, setPaidAt] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [amount, setAmount] = useState(referral.bonusAmount);
  const mutation = useMarkReferralPaid();

  async function handleSubmit() {
    await mutation.mutateAsync({
      id: referral.id,
      bonusPaidAt: new Date(paidAt).toISOString(),
      bonusAmount: amount,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Mark bonus paid</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded hover:bg-surface"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Referrer</label>
            <div className="text-sm text-foreground/80">
              {referral.referrerUser.name}
            </div>
          </div>
          <div>
            <label
              className="block text-sm font-medium mb-1"
              htmlFor="paid-at"
            >
              Payout date
            </label>
            <input
              id="paid-at"
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card"
            />
          </div>
          <div>
            <label
              className="block text-sm font-medium mb-1"
              htmlFor="bonus-amount"
            >
              Bonus amount (AUD)
            </label>
            <input
              id="bonus-amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 text-sm px-3 py-2 rounded-lg border border-border hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={mutation.isPending}
            className="flex-1 text-sm font-medium px-3 py-2 rounded-lg bg-brand text-white hover:bg-brand/90 disabled:opacity-50"
          >
            {mutation.isPending ? "Saving…" : "Mark paid"}
          </button>
        </div>
      </div>
    </div>
  );
}
