"use client";

import { useState } from "react";
import { useUpdateService } from "@/hooks/useServices";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { toast } from "@/hooks/useToast";
import type { SessionTimes } from "@/lib/service-settings";
import { Edit3, Clock, Loader2 } from "lucide-react";

const SESSION_TYPES = [
  { key: "bsc", label: "BSC" },
  { key: "asc", label: "ASC" },
  { key: "vc", label: "VC" },
] as const;
type SessionKey = (typeof SESSION_TYPES)[number]["key"];

type SessionRow = { start: string; end: string };
type EditableSessionTimes = Record<SessionKey, SessionRow>;

function toEditableSessionTimes(value: SessionTimes | null | undefined): EditableSessionTimes {
  return {
    bsc: { start: value?.bsc?.start ?? "", end: value?.bsc?.end ?? "" },
    asc: { start: value?.asc?.start ?? "", end: value?.asc?.end ?? "" },
    vc: { start: value?.vc?.start ?? "", end: value?.vc?.end ?? "" },
  };
}

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
  const [formSessionTimes, setFormSessionTimes] = useState<EditableSessionTimes>(
    toEditableSessionTimes(service.sessionTimes as SessionTimes | null | undefined),
  );
  const saving = updateService.isPending;

  const sessionTimes = (service.sessionTimes ?? null) as SessionTimes | null;
  const populatedSessions = SESSION_TYPES.filter((s) => {
    const entry = sessionTimes?.[s.key];
    return !!entry && !!entry.start && !!entry.end;
  });

  function openEditor() {
    setFormServiceApproval(service.serviceApprovalNumber ?? "");
    setFormProviderApproval(service.providerApprovalNumber ?? "");
    setFormSessionTimes(toEditableSessionTimes(service.sessionTimes as SessionTimes | null | undefined));
    setOpen(true);
  }

  function buildSessionTimesPayload(): SessionTimes | null {
    const out: SessionTimes = {};
    for (const s of SESSION_TYPES) {
      const row = formSessionTimes[s.key];
      const start = row.start.trim();
      const end = row.end.trim();
      if (start && end) out[s.key] = { start, end };
    }
    return Object.keys(out).length > 0 ? out : null;
  }

  async function handleSave() {
    try {
      await updateService.mutateAsync({
        id: service.id,
        serviceApprovalNumber: formServiceApproval.trim() || null,
        providerApprovalNumber: formProviderApproval.trim() || null,
        sessionTimes: buildSessionTimesPayload(),
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
            <span className="text-[10px] text-muted block">Service Approval #</span>
            <span className="text-foreground">
              {service.serviceApprovalNumber ? service.serviceApprovalNumber : "—"}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-muted block">Provider Approval #</span>
            <span className="text-foreground">
              {service.providerApprovalNumber ? service.providerApprovalNumber : "—"}
            </span>
          </div>
        </div>

        {populatedSessions.length > 0 && (
          <div className="pt-2 border-t border-border/60">
            <span className="text-[10px] text-muted block mb-1 uppercase tracking-wider">
              Session Times
            </span>
            <ul className="space-y-1">
              {populatedSessions.map((s) => {
                const row = sessionTimes![s.key]!;
                return (
                  <li key={s.key} className="flex items-center gap-2 text-sm text-foreground">
                    <span className="font-semibold uppercase text-xs w-10">{s.label}</span>
                    <span>
                      {row.start} – {row.end}
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
                <label className="text-[10px] text-muted block mb-0.5 uppercase tracking-wider">
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
                <label className="text-[10px] text-muted block mb-0.5 uppercase tracking-wider">
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

            <div>
              <span className="text-[10px] text-muted block mb-2 uppercase tracking-wider">
                Session Times (HH:MM)
              </span>
              <div className="space-y-2">
                {SESSION_TYPES.map((s) => (
                  <div key={s.key} className="grid grid-cols-[3rem_1fr_1fr] gap-2 items-center">
                    <span className="text-xs font-semibold text-foreground uppercase">
                      {s.label}
                    </span>
                    <input
                      type="time"
                      value={formSessionTimes[s.key].start}
                      onChange={(e) =>
                        setFormSessionTimes((f) => ({
                          ...f,
                          [s.key]: { ...f[s.key], start: e.target.value },
                        }))
                      }
                      aria-label={`${s.label} start time`}
                      className="w-full px-2 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
                    />
                    <input
                      type="time"
                      value={formSessionTimes[s.key].end}
                      onChange={(e) =>
                        setFormSessionTimes((f) => ({
                          ...f,
                          [s.key]: { ...f[s.key], end: e.target.value },
                        }))
                      }
                      aria-label={`${s.label} end time`}
                      className="w-full px-2 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => !saving && setOpen(false)}
                className="text-xs px-3 py-1.5 text-muted hover:text-foreground rounded-md"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="text-xs px-3 py-1.5 bg-brand text-white rounded-md hover:bg-brand/90 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
