"use client";

/**
 * ServiceMedicationTab — Today view of medication doses + log-dose modal.
 *
 * Reads `child.medicationDetails` free text to seed the "log dose" form (the
 * child's existing medication record comes from their enrolment). Doses logged
 * here feed `MedicationAdministration`, which is the auditable record.
 */

import { useMemo, useState } from "react";
import { Pill, Plus, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { fetchApi } from "@/lib/fetch-api";
import { useQuery } from "@tanstack/react-query";
import {
  useMedications,
  useLogDose,
  type MedicationRoute,
  type MedicationDose,
} from "@/hooks/useMedications";

interface ChildWithMedication {
  id: string;
  firstName: string;
  surname: string;
  medicationDetails: string | null;
  medicalConditions?: string[];
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ServiceMedicationTab({ serviceId }: { serviceId: string }) {
  const [logFor, setLogFor] = useState<ChildWithMedication | null>(null);

  const { data: children } = useQuery<ChildWithMedication[]>({
    queryKey: ["service-children-medical", serviceId],
    queryFn: () =>
      fetchApi<ChildWithMedication[]>(`/api/children?service=${serviceId}`),
    retry: 2,
    staleTime: 60_000,
  });

  const { data: doses } = useMedications(serviceId, { date: todayIso() });

  const childrenWithMeds = useMemo(
    () => (children ?? []).filter((c) => c.medicationDetails?.trim()),
    [children],
  );

  const dosesByChild = useMemo(() => {
    const m = new Map<string, MedicationDose[]>();
    (doses?.items ?? []).forEach((d) => {
      const arr = m.get(d.childId) ?? [];
      arr.push(d);
      m.set(d.childId, arr);
    });
    return m;
  }, [doses]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-heading font-semibold text-[color:var(--color-muted)] uppercase tracking-[0.08em]">
          Medication — today
        </h2>
      </div>

      {childrenWithMeds.length === 0 ? (
        <div
          className={cn(
            "rounded-[var(--radius-md)] bg-[color:var(--color-cream-soft)]",
            "border border-dashed border-[color:var(--color-border)] p-8 text-center",
          )}
        >
          <Stethoscope className="w-8 h-8 mx-auto text-[color:var(--color-brand)]/60 mb-2" />
          <p className="text-sm font-medium text-[color:var(--color-foreground)]">
            No children with scheduled medication
          </p>
          <p className="text-xs text-[color:var(--color-muted)] mt-1">
            Medication details come from enrolment submissions. Add them in the
            child profile if missing.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {childrenWithMeds.map((c) => {
            const logged = dosesByChild.get(c.id) ?? [];
            return (
              <li key={c.id} className="warm-card-dense p-3">
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full shrink-0 flex items-center justify-center",
                      "bg-[color:var(--color-brand-soft)] text-[color:var(--color-brand)]",
                    )}
                  >
                    <Pill className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[color:var(--color-foreground)]">
                      {c.firstName} {c.surname}
                    </p>
                    <p className="text-[12px] text-[color:var(--color-muted)] whitespace-pre-wrap line-clamp-2">
                      {c.medicationDetails}
                    </p>
                    {logged.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {logged.map((d) => {
                          const t = new Date(d.administeredAt);
                          return (
                            <div
                              key={d.id}
                              className={cn(
                                "inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--radius-xs)]",
                                "bg-[color:var(--color-cream-deep)] text-[11px] text-[color:var(--color-foreground)]/80 mr-1",
                              )}
                            >
                              <span className="font-medium">
                                {d.medicationName}
                              </span>
                              <span>{d.dose}</span>
                              <span className="text-[color:var(--color-muted)]">
                                @ {t.toLocaleTimeString(undefined, {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setLogFor(c)}
                    className={cn(
                      "inline-flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-sm)]",
                      "bg-[color:var(--color-brand)] text-white text-[12px] font-medium shrink-0",
                      "hover:bg-[color:var(--color-brand-hover)] transition-colors",
                    )}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Log dose
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {logFor && (
        <LogDoseDialog
          serviceId={serviceId}
          child={logFor}
          onClose={() => setLogFor(null)}
        />
      )}
    </div>
  );
}

function LogDoseDialog({
  serviceId,
  child,
  onClose,
}: {
  serviceId: string;
  child: ChildWithMedication;
  onClose: () => void;
}) {
  const log = useLogDose(serviceId);
  const [medicationName, setMedicationName] = useState("");
  const [dose, setDose] = useState("");
  const [route, setRoute] = useState<MedicationRoute>("oral");
  const [witnessedById, setWitnessedById] = useState("");
  const [notes, setNotes] = useState("");

  // Staff list for witness picker
  const { data: users } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["users-list-for-witness"],
    queryFn: () => fetchApi<{ id: string; name: string }[]>(`/api/users`),
    retry: 2,
    staleTime: 300_000,
  });

  const witnessRequired = route === "injection";
  const valid =
    medicationName.trim() &&
    dose.trim() &&
    (!witnessRequired || !!witnessedById);

  async function submit() {
    if (!valid) return;
    await log.mutateAsync({
      childId: child.id,
      medicationName: medicationName.trim(),
      dose: dose.trim(),
      route,
      administeredAt: new Date().toISOString(),
      witnessedById: witnessedById || undefined,
      notes: notes.trim() || undefined,
      clientMutationId: crypto.randomUUID(),
    });
    onClose();
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent>
        <DialogTitle className="text-base font-semibold mb-1">
          Log dose — {child.firstName} {child.surname}
        </DialogTitle>
        {child.medicationDetails && (
          <p className="text-[12px] text-[color:var(--color-muted)] mb-3 whitespace-pre-wrap">
            On file: {child.medicationDetails}
          </p>
        )}
        <div className="space-y-3">
          <Field label="Medication">
            <input
              value={medicationName}
              onChange={(e) => setMedicationName(e.target.value)}
              placeholder="e.g. Ventolin, Paracetamol, EpiPen"
              className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-2 py-1.5 text-sm bg-[color:var(--color-cream-deep)]"
            />
          </Field>
          <Field label="Dose">
            <input
              value={dose}
              onChange={(e) => setDose(e.target.value)}
              placeholder="e.g. 5ml, 2 puffs, 300mcg"
              className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-2 py-1.5 text-sm bg-[color:var(--color-cream-deep)]"
            />
          </Field>
          <Field label="Route">
            <select
              value={route}
              onChange={(e) => setRoute(e.target.value as MedicationRoute)}
              className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-2 py-1.5 text-sm bg-[color:var(--color-cream-deep)]"
            >
              <option value="oral">Oral</option>
              <option value="topical">Topical</option>
              <option value="inhaled">Inhaled</option>
              <option value="injection">Injection (witness required)</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field
            label={witnessRequired ? "Witness (required)" : "Witness (optional)"}
          >
            <select
              value={witnessedById}
              onChange={(e) => setWitnessedById(e.target.value)}
              className={cn(
                "w-full rounded-[var(--radius-sm)] border px-2 py-1.5 text-sm bg-[color:var(--color-cream-deep)]",
                witnessRequired && !witnessedById
                  ? "border-[color:var(--color-danger)]"
                  : "border-[color:var(--color-border)]",
              )}
            >
              <option value="">Not witnessed</option>
              {users?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notes (optional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-2 py-1.5 text-sm bg-[color:var(--color-cream-deep)] resize-y"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm font-medium text-[color:var(--color-muted)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!valid || log.isPending}
              className={cn(
                "px-3 py-1.5 rounded-[var(--radius-sm)]",
                "bg-[color:var(--color-brand)] text-white text-[13px] font-medium",
                "hover:bg-[color:var(--color-brand-hover)] transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              {log.isPending ? "Saving…" : "Log dose"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-muted)] mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
