"use client";

/**
 * Move a family — parent and children together — to another service.
 *
 * The point of doing it from the family rather than each child is that
 * the billing contacts travel with them. Moving children alone leaves a
 * household on the new centre's roll that the new centre can't invoice,
 * which nobody notices until an invoice run comes up short.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Building2 } from "lucide-react";
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

const control =
  "w-full px-3 py-2.5 border border-border rounded-lg text-base sm:text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand/30";

export function MoveFamilyServiceDialog({
  familyId,
  childRecords,
  open,
  onOpenChange,
}: {
  familyId: string;
  childRecords: Array<{ id: string; name: string; serviceName: string | null }>;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [serviceId, setServiceId] = useState("");
  const [selected, setSelected] = useState<string[]>(
    childRecords.map((c) => c.id),
  );

  const { data: services } = useQuery<ServiceOption[]>({
    queryKey: ["services", "options"],
    queryFn: () => fetchApi("/api/services"),
    enabled: open,
    retry: 1,
  });

  const move = useMutation({
    mutationFn: () =>
      mutateApi<{ childrenMoved: number; serviceName: string }>(
        `/api/families/${familyId}/service`,
        {
          method: "POST",
          body: {
            serviceId,
            ...(selected.length === childRecords.length
              ? {}
              : { childIds: selected }),
          },
        },
      ),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["families"] });
      qc.invalidateQueries({ queryKey: ["children"] });
      qc.invalidateQueries({ queryKey: ["enrolments"] });
      toast({
        description: `${data.childrenMoved} ${
          data.childrenMoved === 1 ? "child" : "children"
        } moved to ${data.serviceName}, with the family's billing contacts.`,
      });
      onOpenChange(false);
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  const available = (services ?? []).filter(
    (s) => (s.status ?? "active") === "active",
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogTitle>Move family to a service</DialogTitle>
        <DialogDescription>
          Moves the children and the family&apos;s billing contacts together,
          across every enrolment they have.
        </DialogDescription>

        <div className="space-y-4 mt-4">
          <div>
            <label
              htmlFor="mf-service"
              className="block text-sm font-medium mb-1"
            >
              Service
            </label>
            <select
              id="mf-service"
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

          <div>
            <span className="block text-sm font-medium mb-2">Which children?</span>
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
                    {c.name}
                    {c.serviceName && (
                      <span className="text-muted"> · {c.serviceName}</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted">
              Siblings can attend different campuses — untick anyone staying
              put.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => move.mutate()}
              disabled={!serviceId || selected.length === 0 || move.isPending}
            >
              {move.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Moving…</>
              ) : (
                <><Building2 className="w-4 h-4" /> Move</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
