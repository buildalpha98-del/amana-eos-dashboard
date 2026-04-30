"use client";

import { useState } from "react";
import { Shield, Check, ChevronRight, Loader2 } from "lucide-react";
import {
  useMyPendingPolicies,
  useAcknowledgePolicy,
  type PolicyData,
} from "@/hooks/usePolicies";

interface Props {
  onSelect?: (policyId: string) => void;
}

export function PolicyInbox({ onSelect }: Props) {
  const { data, isLoading } = useMyPendingPolicies();
  const ack = useAcknowledgePolicy();
  const [ackingId, setAckingId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-3 text-sm text-muted">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading your pending policies…
        </div>
      </div>
    );
  }

  const policies = data ?? [];
  if (policies.length === 0) {
    return null;
  }

  const handleAck = async (policy: PolicyData) => {
    setAckingId(policy.id);
    try {
      await ack.mutateAsync(policy.id);
    } finally {
      setAckingId(null);
    }
  };

  return (
    <div
      data-testid="policy-inbox"
      className="bg-amber-50 border border-amber-200 rounded-xl p-4 sm:p-5"
    >
      <div className="flex items-center gap-2 mb-3">
        <Shield className="w-4 h-4 text-amber-700" />
        <h3 className="text-sm font-semibold text-amber-900">
          {policies.length} {policies.length === 1 ? "policy needs" : "policies need"} your acknowledgement
        </h3>
      </div>
      <ul className="space-y-2">
        {policies.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between gap-3 bg-card rounded-lg px-3 py-2 border border-amber-100"
          >
            <button
              type="button"
              onClick={() => onSelect?.(p.id)}
              className="flex-1 flex items-center gap-2 text-left hover:underline"
            >
              <ChevronRight className="w-4 h-4 text-amber-700 shrink-0" />
              <span className="text-sm font-medium text-foreground truncate">
                {p.title}
              </span>
              <span className="text-xs text-muted shrink-0">v{p.version}</span>
            </button>
            <button
              type="button"
              onClick={() => handleAck(p)}
              disabled={ackingId === p.id}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors disabled:opacity-60"
            >
              {ackingId === p.id ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Check className="w-3 h-3" />
              )}
              Acknowledge
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
