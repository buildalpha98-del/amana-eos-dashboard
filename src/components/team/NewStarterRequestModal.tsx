"use client";

/**
 * NewStarterRequestModal — the Team tab's Onboarding sub-tab intake form.
 * A state manager/admin/owner fills this out for a known new hire; it
 * notifies every admin-tier user so someone completes the actual account
 * creation (Add staff member) + induction pack. This form does NOT create
 * a User account itself — see the "Notify only" decision.
 */

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { toast } from "@/hooks/useToast";
import { useCreateOnboardingRequest, type NewStarterRequestInput } from "@/hooks/useOnboardingRequests";
import { AWARD_LEVEL_LABELS } from "@/components/contracts/constants";
import type { EmploymentType, AwardLevel, QualificationType } from "@prisma/client";

interface ServiceOption {
  id: string;
  name: string;
}

const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  casual: "Casual",
  part_time: "Part-Time",
  permanent: "Permanent",
  fixed_term: "Fixed Term",
};

// Only the qualification levels relevant to a new-starter intake — the
// full QualificationType enum also carries first_aid/wwcc/other which
// don't belong on this form.
const QUALIFICATION_OPTIONS: Array<{ value: QualificationType | ""; label: string }> = [
  { value: "", label: "None yet" },
  { value: "cert_iii", label: "Certificate III" },
  { value: "diploma", label: "Diploma" },
  { value: "bachelor", label: "Bachelor's degree" },
];

const AWARD_LEVEL_OPTIONS: AwardLevel[] = [
  "cs1",
  "cs2",
  "cs3",
  "cs4",
  "es1",
  "es2",
  "es3",
  "es4",
  "coordinator",
  "director",
  "custom",
];

export function NewStarterRequestModal({
  open,
  onClose,
  services,
}: {
  open: boolean;
  onClose: () => void;
  services: ServiceOption[];
}) {
  const create = useCreateOnboardingRequest();
  const [form, setForm] = useState({
    fullName: "",
    dateOfBirth: "",
    address: "",
    targetPosition: "",
    employmentType: "casual" as EmploymentType,
    awardLevel: "cs1" as AwardLevel,
    awardLevelCustom: "",
    qualification: "" as QualificationType | "",
    serviceId: services[0]?.id ?? "",
    expectedStartDate: "",
    notes: "",
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fullName.trim() || !form.dateOfBirth || !form.address.trim()) {
      toast({ variant: "destructive", description: "Full name, date of birth, and address are required." });
      return;
    }
    if (!form.targetPosition.trim()) {
      toast({ variant: "destructive", description: "Enter the position they're joining as." });
      return;
    }
    if (!form.serviceId) {
      toast({ variant: "destructive", description: "Select which centre they're joining." });
      return;
    }
    if (!form.expectedStartDate) {
      toast({ variant: "destructive", description: "Enter their expected start date." });
      return;
    }
    if (form.awardLevel === "custom" && !form.awardLevelCustom.trim()) {
      toast({ variant: "destructive", description: "Enter a label for the custom award level." });
      return;
    }

    const input: NewStarterRequestInput = {
      fullName: form.fullName.trim(),
      dateOfBirth: form.dateOfBirth,
      address: form.address.trim(),
      targetPosition: form.targetPosition.trim(),
      employmentType: form.employmentType,
      awardLevel: form.awardLevel,
      awardLevelCustom: form.awardLevel === "custom" ? form.awardLevelCustom.trim() : undefined,
      qualification: form.qualification || null,
      serviceId: form.serviceId,
      expectedStartDate: form.expectedStartDate,
      notes: form.notes.trim() || undefined,
    };

    await create.mutateAsync(input);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogTitle>New onboarding request</DialogTitle>
        <p className="text-sm text-muted -mt-2 mb-2">
          Flag a new hire so admin can set up their account and induction pack.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-muted block mb-1">Full name</label>
            <input
              autoFocus
              type="text"
              value={form.fullName}
              onChange={(e) => set("fullName", e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="Full name"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted block mb-1">Date of birth</label>
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => set("dateOfBirth", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">Expected start date</label>
              <input
                type="date"
                value={form.expectedStartDate}
                onChange={(e) => set("expectedStartDate", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">Address</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="Street address, suburb, state, postcode"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted block mb-1">Position</label>
              <input
                type="text"
                value={form.targetPosition}
                onChange={(e) => set("targetPosition", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand"
                placeholder="e.g. Educator, Service Coordinator"
              />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">Centre</label>
              <select
                value={form.serviceId}
                onChange={(e) => set("serviceId", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand"
              >
                {services.length === 0 && <option value="">No centres available</option>}
                {services.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted block mb-1">Employment type</label>
              <select
                value={form.employmentType}
                onChange={(e) => set("employmentType", e.target.value as EmploymentType)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand"
              >
                {(Object.keys(EMPLOYMENT_TYPE_LABELS) as EmploymentType[]).map((v) => (
                  <option key={v} value={v}>{EMPLOYMENT_TYPE_LABELS[v]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">Qualification</label>
              <select
                value={form.qualification}
                onChange={(e) => set("qualification", e.target.value as QualificationType | "")}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand"
              >
                {QUALIFICATION_OPTIONS.map((o) => (
                  <option key={o.value || "none"} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted block mb-1">Award level</label>
              <select
                value={form.awardLevel}
                onChange={(e) => set("awardLevel", e.target.value as AwardLevel)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand"
              >
                {AWARD_LEVEL_OPTIONS.map((v) => (
                  <option key={v} value={v}>{AWARD_LEVEL_LABELS[v]}</option>
                ))}
              </select>
            </div>
            {form.awardLevel === "custom" && (
              <div>
                <label className="text-xs text-muted block mb-1">Custom label</label>
                <input
                  type="text"
                  value={form.awardLevelCustom}
                  onChange={(e) => set("awardLevelCustom", e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="e.g. Above-award rate"
                />
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">Notes (optional)</label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="Anything else admin should know"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={create.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Send to admin
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
