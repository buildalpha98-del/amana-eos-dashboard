"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { useCreateActivation } from "@/hooks/useActivations";
import { fetchApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import type { ActivationType } from "@prisma/client";

interface CampaignOption {
  id: string;
  name: string;
  type: string;
}

interface ServiceOption {
  id: string;
  name: string;
  code: string;
}

const ACTIVATION_TYPES: Array<{ value: ActivationType; label: string }> = [
  { value: "open_day", label: "Open day" },
  { value: "free_breakfast", label: "Free breakfast" },
  { value: "parent_info_session", label: "Parent info session" },
  { value: "expert_talk", label: "Expert talk" },
  { value: "programme_taster", label: "Programme taster" },
  { value: "holiday_quest_preview", label: "Holiday Quest preview" },
  { value: "community_event", label: "Community event" },
  { value: "other", label: "Other" },
];

interface NewActivationModalProps {
  open: boolean;
  onClose: () => void;
  initialServiceId?: string;
  initialCampaignId?: string;
}

export function NewActivationModal({ open, onClose, initialServiceId, initialCampaignId }: NewActivationModalProps) {
  const create = useCreateActivation();
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [campaignId, setCampaignId] = useState(initialCampaignId ?? "");
  const [serviceId, setServiceId] = useState(initialServiceId ?? "");
  const [activationType, setActivationType] = useState<ActivationType | "">("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [expectedAttendance, setExpectedAttendance] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setCampaignId(initialCampaignId ?? "");
    setServiceId(initialServiceId ?? "");
    Promise.all([
      fetchApi<{ activations: unknown; unassignedCampaigns: CampaignOption[] }>("/api/marketing/activations").catch(() => null),
      fetchApi<ServiceOption[]>("/api/services?status=active").catch(() => []),
    ]).then(([actsResp, servs]) => {
      // Pull all campaigns by combining unassigned + the campaign on each activation
      // Simpler: hit the marketing campaigns endpoint if it exists; otherwise use unassigned only.
      fetchApi<Array<{ id: string; name: string; type: string }>>("/api/marketing/campaigns").then((all) => {
        setCampaigns(all.filter((c) => ["event", "launch", "activation"].includes(c.type)));
      }).catch(() => {
        setCampaigns(actsResp?.unassignedCampaigns ?? []);
      });
      setServices(Array.isArray(servs) ? servs : []);
    });
  }, [open, initialServiceId, initialCampaignId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!campaignId || !serviceId) {
      toast({ variant: "destructive", description: "Campaign and centre are required" });
      return;
    }
    try {
      await create.mutateAsync({
        campaignId,
        serviceId,
        activationType: activationType || undefined,
        scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
        expectedAttendance: expectedAttendance ? parseInt(expectedAttendance, 10) : undefined,
        notes: notes.trim() || undefined,
      });
      toast({ description: "Activation created" });
      onClose();
    } catch {
      // hook toast
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>New activation</DialogTitle>
        <DialogDescription>
          Pick a campaign + a centre. The activation starts in <em>concept</em> stage; advance it via the lifecycle stepper as work progresses.
        </DialogDescription>

        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Campaign *</label>
            <select
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              required
              className="w-full rounded-md border border-border bg-card p-2 text-sm"
            >
              <option value="">— Select campaign —</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Centre *</label>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              required
              className="w-full rounded-md border border-border bg-card p-2 text-sm"
            >
              <option value="">— Select centre —</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Type</label>
            <select
              value={activationType}
              onChange={(e) => setActivationType(e.target.value as ActivationType | "")}
              className="w-full rounded-md border border-border bg-card p-2 text-sm"
            >
              <option value="">—</option>
              {ACTIVATION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Scheduled date</label>
              <input
                type="date"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                className="w-full rounded-md border border-border bg-card p-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Expected attendance</label>
              <input
                type="number"
                min={0}
                value={expectedAttendance}
                onChange={(e) => setExpectedAttendance(e.target.value)}
                className="w-full rounded-md border border-border bg-card p-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-border bg-card p-2 text-sm"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" loading={create.isPending}>Create</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
