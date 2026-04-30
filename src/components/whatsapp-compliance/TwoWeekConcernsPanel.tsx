"use client";

import type { TwoWeekConcern } from "@/hooks/useWhatsAppCompliance";
import { useFlagCoordinator } from "@/hooks/useWhatsAppCompliance";
import { Button } from "@/components/ui/Button";
import { toast } from "@/hooks/useToast";
import { Flag, History, CalendarPlus } from "lucide-react";

interface TwoWeekConcernsPanelProps {
  concerns: TwoWeekConcern[];
  onViewHistory: (serviceId: string) => void;
  onAddToOneOnOne: (concern: TwoWeekConcern) => void;
}

export function TwoWeekConcernsPanel({ concerns, onViewHistory, onAddToOneOnOne }: TwoWeekConcernsPanelProps) {
  const flag = useFlagCoordinator();

  const onFlag = async (concern: TwoWeekConcern) => {
    try {
      const result = await flag.mutateAsync({
        serviceId: concern.serviceId,
        context: "two_week_pattern",
      });
      if (result.whatsappLink) {
        window.open(result.whatsappLink, "_blank", "noopener,noreferrer");
      } else {
        try {
          await navigator.clipboard.writeText(result.message);
          toast({ description: "No phone on file — message copied to clipboard." });
        } catch {
          toast({ description: result.message });
        }
      }
    } catch {
      // hook toast
    }
  };

  if (concerns.length === 0) {
    return (
      <section className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
        No coordinator patterns flagged this week. ✓
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold">Two-Week Concerns ({concerns.length})</h3>
      <ul className="space-y-2">
        {concerns.map((c) => (
          <li
            key={c.serviceId}
            className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2"
          >
            <div>
              <div className="font-medium text-foreground flex items-center gap-2">
                <Flag className="w-4 h-4 text-red-700" />
                {c.coordinatorName ?? "Coordinator"} ({c.serviceName})
              </div>
              <div className="text-xs text-muted">
                This week: {c.thisWeekPosted}/5 · Last week: {c.lastWeekPosted}/5
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onViewHistory(c.serviceId)}
                iconLeft={<History className="w-4 h-4" />}
              >
                View 8-week history
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onFlag(c)}
                loading={flag.isPending}
                iconLeft={<Flag className="w-4 h-4" />}
              >
                Flag coordinator
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onAddToOneOnOne(c)}
                iconLeft={<CalendarPlus className="w-4 h-4" />}
              >
                Add to 1:1
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
