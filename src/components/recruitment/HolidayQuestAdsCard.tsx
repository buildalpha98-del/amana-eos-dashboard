"use client";

/**
 * One click to set up the summer Holiday Quest job ads — one per region
 * (src/lib/recruitment/holiday-quest-ads.ts). They're created as drafts:
 * open each, check it, set a closing date if you want one, then tick
 * "Show on public careers page".
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sun } from "lucide-react";
import { mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { Button } from "@/components/ui/Button";
import { HOLIDAY_QUEST_ADS } from "@/lib/recruitment/holiday-quest-ads";

export function HolidayQuestAdsCard() {
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: () => mutateApi<{ created: number; skipped: number }>("/api/recruitment/holiday-quest", { method: "POST" }),
    onSuccess: (r) => {
      toast({
        description: r.created
          ? `Created ${r.created} Holiday Quest ad${r.created === 1 ? "" : "s"} as drafts. Open each one, check it, then switch on "Show on public careers page".`
          : "All five Holiday Quest ads already exist.",
      });
      qc.invalidateQueries({ queryKey: ["recruitment-vacancies"] });
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="rounded-full bg-accent/30 p-2 text-brand">
          <Sun className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-foreground">Summer Holiday Quest ads</p>
          <p className="text-sm text-muted">
            {HOLIDAY_QUEST_ADS.length} casual ads, one per region:{" "}
            {HOLIDAY_QUEST_ADS.map((a) => `${a.region} (${a.state})`).join(", ")}. VIC asks for diploma-level ($40–$46/hr), NSW
            for no qualification ($35–$45/hr). Created as drafts for you to check before they go live.
          </p>
        </div>
      </div>
      <Button onClick={() => create.mutate()} loading={create.isPending}>
        Create the Holiday Quest ads
      </Button>
    </div>
  );
}
