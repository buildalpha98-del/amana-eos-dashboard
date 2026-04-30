"use client";

import { useUpdateService } from "@/hooks/useServices";
import { DollarSign } from "lucide-react";

export function RatesCard({
  service,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: any;
}) {
  const updateService = useUpdateService();

  return (
    <>
      {/* Daily Rates */}
      <div>
        <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">
          <DollarSign className="w-3.5 h-3.5 inline mr-1" />
          Daily Rates (per child per day)
        </label>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] text-muted block mb-0.5">BSC</label>
            <input
              type="number"
              min={0}
              step={0.5}
              defaultValue={service.bscDailyRate ?? ""}
              onBlur={(e) => {
                const val = parseFloat(e.target.value);
                updateService.mutate({
                  id: service.id,
                  bscDailyRate: isNaN(val) ? null : val,
                });
              }}
              className="w-full px-2 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="$0"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted block mb-0.5">ASC</label>
            <input
              type="number"
              min={0}
              step={0.5}
              defaultValue={service.ascDailyRate ?? ""}
              onBlur={(e) => {
                const val = parseFloat(e.target.value);
                updateService.mutate({
                  id: service.id,
                  ascDailyRate: isNaN(val) ? null : val,
                });
              }}
              className="w-full px-2 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="$0"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted block mb-0.5">VC</label>
            <input
              type="number"
              min={0}
              step={0.5}
              defaultValue={service.vcDailyRate ?? ""}
              onBlur={(e) => {
                const val = parseFloat(e.target.value);
                updateService.mutate({
                  id: service.id,
                  vcDailyRate: isNaN(val) ? null : val,
                });
              }}
              className="w-full px-2 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="$0"
            />
          </div>
        </div>
      </div>

      {/* Casual Rates */}
      <div>
        <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">
          <DollarSign className="w-3.5 h-3.5 inline mr-1" />
          Casual Rates (per child per session)
        </label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted block mb-0.5">BSC Casual</label>
            <input
              type="number"
              min={0}
              step={0.5}
              defaultValue={service.bscCasualRate ?? 0}
              onBlur={(e) => {
                const val = parseFloat(e.target.value);
                updateService.mutate({
                  id: service.id,
                  bscCasualRate: isNaN(val) ? 0 : val,
                });
              }}
              className="w-full px-2 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="$0"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted block mb-0.5">ASC Casual</label>
            <input
              type="number"
              min={0}
              step={0.5}
              defaultValue={service.ascCasualRate ?? 0}
              onBlur={(e) => {
                const val = parseFloat(e.target.value);
                updateService.mutate({
                  id: service.id,
                  ascCasualRate: isNaN(val) ? 0 : val,
                });
              }}
              className="w-full px-2 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="$0"
            />
          </div>
        </div>
      </div>
    </>
  );
}
