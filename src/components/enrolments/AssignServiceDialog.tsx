"use client";

/**
 * Assign an enrolment to a service, or copy it to a second one.
 *
 * Both live here because they're the same decision from the staff side —
 * "which centre does this family belong to?" — and splitting them into
 * two dialogs would mean picking the right one before you know.
 *
 * ASSIGN is for an enrolment with no service: the school a family typed
 * didn't resolve, or resolved ambiguously between campuses. Those
 * enrolments are otherwise invisible in every per-service view.
 *
 * DUPLICATE is for a family who already attends one centre and needs a
 * place at another.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Copy, Loader2, ArrowRight } from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

interface ServiceOption {
  id: string;
  name: string;
  status?: string;
}

export interface EnrolmentChild {
  id: string;
  firstName: string;
  surname: string;
  serviceId?: string | null;
}

const control =
  "w-full px-3 py-2.5 border border-border rounded-lg text-base sm:text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand/30";

export function AssignServiceDialog({
  enrolmentId,
  // Named `childRecords`, not `children` — a prop called `children` on a
  // React component means the nested JSX, and lint rightly rejects it.
  childRecords,
  currentServiceId,
  currentServiceName,
  mode,
  open,
  onOpenChange,
}: {
  enrolmentId: string;
  childRecords: EnrolmentChild[];
  currentServiceId?: string | null;
  currentServiceName?: string | null;
  /** "assign" for an unplaced enrolment, "duplicate" for a second centre. */
  mode: "assign" | "duplicate";
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [serviceId, setServiceId] = useState("");
  const [selected, setSelected] = useState<string[]>(childRecords.map((c) => c.id));
  const [move, setMove] = useState(false);

  const { data: services } = useQuery<ServiceOption[]>({
    queryKey: ["services", "options"],
    queryFn: () => fetchApi("/api/services"),
    enabled: open,
    retry: 1,
  });

  const run = useMutation({
    mutationFn: () =>
      mutateApi(
        `/api/enrolments/${enrolmentId}/${mode === "assign" ? "assign-service" : "duplicate"}`,
        {
          method: "POST",
          body: {
            serviceId,
            // Only send a subset when it IS a subset — sending the full
            // list would stop assign() treating it as the whole enrolment.
            ...(selected.length === childRecords.length ? {} : { childIds: selected }),
            ...(mode === "duplicate" ? { move } : {}),
          },
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["enrolments"] });
      qc.invalidateQueries({ queryKey: ["children"] });
      qc.invalidateQueries({ queryKey: ["families"] });
      toast({
        description:
          mode === "assign"
            ? "Enrolment assigned — the family and children are now linked to that service."
            : move
              ? "Children moved to the new service."
              : "Enrolment copied. The new service still needs to confirm it.",
      });
      onOpenChange(false);
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  const available = (services ?? []).filter(
    (s) => s.id !== currentServiceId && (s.status ?? "active") === "active",
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogTitle>
          {mode === "assign" ? "Assign to a service" : "Enrol at another service"}
        </DialogTitle>
        <DialogDescription>
          {mode === "assign"
            ? "This enrolment isn't linked to a centre yet, so its children don't appear on any roll. Assigning it also creates the family's billing contact there."
            : "Copies this family's details to another centre. Their bookings, attendance and invoices stay with the original — those belong to the centre that provided the care."}
        </DialogDescription>

        <div className="space-y-4 mt-4">
          {currentServiceName && (
            <p className="text-sm text-muted flex items-center gap-2">
              <Building2 className="w-4 h-4 shrink-0" />
              Currently at <strong className="text-foreground">{currentServiceName}</strong>
            </p>
          )}

          <div>
            <label htmlFor="as-service" className="block text-sm font-medium mb-1">
              {mode === "assign" ? "Service" : "New service"}
            </label>
            <select
              id="as-service"
              className={control}
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
            >
              <option value="">Select a service…</option>
              {available.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {childRecords.length > 0 && (
            <div>
              <span className="block text-sm font-medium mb-2">
                Which children?
              </span>
              <div className="space-y-1.5">
                {childRecords.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-3 cursor-pointer min-h-11"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(c.id)}
                      onChange={() =>
                        setSelected((prev) =>
                          prev.includes(c.id)
                            ? prev.filter((x) => x !== c.id)
                            : [...prev, c.id],
                        )
                      }
                      className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                    />
                    <span className="text-sm text-foreground">
                      {c.firstName} {c.surname}
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">
                Siblings can attend different campuses — pick only those
                moving.
              </p>
            </div>
          )}

          {mode === "duplicate" && (
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={move}
                onChange={(e) => setMove(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand"
              />
              <span className="text-sm text-foreground">
                Move rather than copy
                <span className="block text-xs text-muted">
                  Withdraws them from {currentServiceName ?? "the current centre"}.
                  Their attendance and invoice history there is kept.
                </span>
              </span>
            </label>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => run.mutate()}
              disabled={!serviceId || selected.length === 0 || run.isPending}
            >
              {run.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Working…</>
              ) : mode === "assign" ? (
                <><ArrowRight className="w-4 h-4" /> Assign</>
              ) : (
                <><Copy className="w-4 h-4" /> {move ? "Move" : "Copy"}</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
