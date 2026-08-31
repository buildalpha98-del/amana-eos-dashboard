"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useUpdateService } from "@/hooks/useServices";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { toast } from "@/hooks/useToast";
import { formatTime, roomLabel, type SessionTimes } from "@/lib/service-settings";
import { Edit3, Clock } from "lucide-react";

const SESSION_TYPES = [
  { key: "bsc", label: "BSC" },
  { key: "asc", label: "ASC" },
  { key: "vc", label: "VC" },
] as const;

export function ApprovalsSessionTimesCard({
  service,
  canEdit,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: any;
  canEdit: boolean;
}) {
  const updateService = useUpdateService();
  const [open, setOpen] = useState(false);
  const [formServiceApproval, setFormServiceApproval] = useState("");
  const [formProviderApproval, setFormProviderApproval] = useState("");
  const saving = updateService.isPending;

  const sessionTimes = (service.sessionTimes ?? null) as SessionTimes | null;
  const populatedSessions = SESSION_TYPES.filter((s) => {
    const entry = sessionTimes?.[s.key];
    return !!entry && !!entry.start && !!entry.end;
  });

  function openEditor() {
    setFormServiceApproval(service.serviceApprovalNumber ?? "");
    setFormProviderApproval(service.providerApprovalNumber ?? "");
    setOpen(true);
  }

  async function handleSave() {
    try {
      await updateService.mutateAsync({
        id: service.id,
        serviceApprovalNumber: formServiceApproval.trim() || null,
        providerApprovalNumber: formProviderApproval.trim() || null,
      });
      toast({ description: "Service info updated" });
      setOpen(false);
    } catch {
      // useUpdateService.onError already shows a destructive toast; keep modal open.
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-muted uppercase tracking-wider flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          Service Approvals & Session Times
        </label>
        {canEdit && (
          <button
            type="button"
            onClick={openEditor}
            aria-label="Edit approvals"
            title="Edit approvals and session times"
            className="text-muted hover:text-brand"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="p-4 border border-border rounded-xl bg-card space-y-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <span className="text-2xs text-muted block">Service Approval #</span>
            <span className="text-foreground">
              {service.serviceApprovalNumber ? service.serviceApprovalNumber : "—"}
            </span>
          </div>
          <div>
            <span className="text-2xs text-muted block">Provider Approval #</span>
            <span className="text-foreground">
              {service.providerApprovalNumber ? service.providerApprovalNumber : "—"}
            </span>
          </div>
        </div>

        {populatedSessions.length > 0 && (
          <div className="pt-2 border-t border-border/60">
            <span className="text-2xs text-muted block mb-1 uppercase tracking-wider">
              Session Times
            </span>
            <ul className="space-y-1">
              {populatedSessions.map((s) => {
                const row = sessionTimes![s.key]!;
                return (
                  <li key={s.key} className="flex items-center gap-2 text-sm text-foreground">
                    <span className="text-xs text-muted flex-1 truncate">
                      {roomLabel(sessionTimes, s.key)}
                    </span>
                    <span>
                      {formatTime(row.start)} – {formatTime(row.end)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!saving) setOpen(next);
        }}
      >
        <DialogContent size="lg" className="md:p-6" aria-label="Edit service approvals and session times">
          <DialogTitle className="text-base font-semibold text-foreground mb-4">
            Edit Approvals & Session Times
          </DialogTitle>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-2xs text-muted block mb-0.5 uppercase tracking-wider">
                  Service Approval #
                </label>
                <input
                  autoFocus
                  type="text"
                  value={formServiceApproval}
                  onChange={(e) => setFormServiceApproval(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="e.g. SE-00012345"
                />
              </div>
              <div>
                <label className="text-2xs text-muted block mb-0.5 uppercase tracking-wider">
                  Provider Approval #
                </label>
                <input
                  type="text"
                  value={formProviderApproval}
                  onChange={(e) => setFormProviderApproval(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="e.g. PR-00067890"
                />
              </div>
            </div>

            {/* Room names, hours and fees are edited in Rooms & fees —
                this dialog only ever knew {start, end}, so saving from
                here would have dropped a room's name and its prices. */}
            <p className="text-xs text-muted">
              Session times, room names and fees are set in{" "}
              <strong className="text-foreground">Rooms &amp; fees</strong> below.
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => !saving && setOpen(false)}
                className="text-xs px-3 py-1.5 text-muted hover:text-foreground rounded-md"
                disabled={saving}
              >
                Cancel
              </button>
              <Button type="button" size="xs" onClick={handleSave} loading={saving}>
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
