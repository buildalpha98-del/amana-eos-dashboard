"use client";
import { useState } from "react";
import { useReferrals, type Referral } from "@/hooks/useRecruitment";
import { Users, CheckCircle2 } from "lucide-react";
import { MarkReferralPaidModal } from "./MarkReferralPaidModal";

const STATUS_COLORS: Record<Referral["status"], string> = {
  pending: "bg-amber-100 text-amber-700",
  hired: "bg-blue-100 text-blue-700",
  bonus_paid: "bg-emerald-100 text-emerald-700",
  expired: "bg-gray-100 text-gray-600",
};

const STATUS_LABELS: Record<Referral["status"], string> = {
  pending: "Pending",
  hired: "Hired",
  bonus_paid: "Bonus Paid",
  expired: "Expired",
};

export function ReferralsTable() {
  const { data: referrals = [], isLoading, error } = useReferrals();
  const [paying, setPaying] = useState<Referral | null>(null);

  if (isLoading) {
    return <div className="p-6 text-sm text-muted">Loading referrals…</div>;
  }
  if (error) {
    return <div className="p-6 text-sm text-red-600">{error.message}</div>;
  }
  if (referrals.length === 0) {
    return (
      <div className="p-8 text-center bg-card rounded-xl border border-border">
        <Users className="w-10 h-10 mx-auto text-muted mb-3" />
        <p className="text-sm">No staff referrals yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted text-left bg-surface">
          <tr>
            <th className="p-3">Referrer</th>
            <th className="p-3">Referred</th>
            <th className="p-3">Status</th>
            <th className="p-3">Bonus</th>
            <th className="p-3">Paid at</th>
            <th className="p-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {referrals.map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className="p-3">{r.referrerUser.name}</td>
              <td className="p-3">{r.referredName}</td>
              <td className="p-3">
                <span
                  className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[r.status]}`}
                >
                  {STATUS_LABELS[r.status]}
                </span>
              </td>
              <td className="p-3">${r.bonusAmount.toFixed(2)}</td>
              <td className="p-3">
                {r.bonusPaidAt
                  ? new Date(r.bonusPaidAt).toLocaleDateString("en-AU")
                  : "—"}
              </td>
              <td className="p-3 text-right">
                {(r.status === "pending" || r.status === "hired") && (
                  <button
                    type="button"
                    onClick={() => setPaying(r)}
                    className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded bg-brand/10 text-brand hover:bg-brand/20"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    Mark bonus paid
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {paying && (
        <MarkReferralPaidModal
          referral={paying}
          onClose={() => setPaying(null)}
        />
      )}
    </div>
  );
}
