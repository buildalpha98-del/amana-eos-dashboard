"use client";

/**
 * Which centre this child attends, and how to change it.
 *
 * Lives at the top of the details tab because it's the field that decides
 * whether the child appears on a roll, in a ratio count and on an
 * invoice — and until now it was the one field on this page you couldn't
 * edit, despite the API having accepted it all along.
 *
 * When the child came from an enrolment this reuses the enrolment's
 * assign route rather than a bare serviceId write, so the family's
 * billing contacts move with them. A child on the new roll whose family
 * has no contact there can be rostered but never invoiced.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { AssignServiceDialog } from "@/components/enrolments/AssignServiceDialog";
import { serviceWithReason } from "@/lib/placement-reason";

export function ChildServiceCard({
  child,
  canEdit,
}: {
  child: {
    id: string;
    firstName: string;
    surname: string;
    serviceId: string | null;
    enrolmentId: string | null;
    placementReason?: string | null;
    service?: { id: string; name: string } | null;
  };
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // No enrolment means no parent blob to build billing contacts from, so
  // the dialog has nothing extra to do — a plain service write is honest.
  const linked = Boolean(child.enrolmentId);

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Service</h3>
          <p className="mt-1 text-sm text-foreground flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-muted shrink-0" />
            {child.service?.name ? (
              serviceWithReason(child.service.name, child.placementReason)
            ) : (
              <span className="text-amber-700 dark:text-amber-300">
                Not linked to a service
              </span>
            )}
          </p>
          {!child.serviceId && (
            <p className="mt-1 text-xs text-muted max-w-md">
              While this is unset the child doesn&apos;t appear on any roll,
              ratio count or invoice.
            </p>
          )}
        </div>

        {canEdit &&
          (linked ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-border text-foreground hover:bg-surface transition-colors"
            >
              {child.serviceId ? "Change service" : "Assign to service"}
            </button>
          ) : (
            <UnlinkedServicePicker
              childId={child.id}
              saving={saving}
              setSaving={setSaving}
              onDone={() => router.refresh()}
            />
          ))}
      </div>

      {linked && (
        <AssignServiceDialog
          enrolmentId={child.enrolmentId!}
          childRecords={[
            {
              id: child.id,
              firstName: child.firstName,
              surname: child.surname,
              serviceId: child.serviceId,
            },
          ]}
          currentServiceId={child.serviceId}
          currentServiceName={child.service?.name ?? null}
          mode="assign"
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) router.refresh();
          }}
        />
      )}
    </div>
  );
}

/** Fallback for a child with no enrolment record behind them. */
function UnlinkedServicePicker({
  childId,
  saving,
  setSaving,
  onDone,
}: {
  childId: string;
  saving: boolean;
  setSaving: (v: boolean) => void;
  onDone: () => void;
}) {
  const [services, setServices] = useState<{ id: string; name: string }[]>([]);

  return (
    <select
      aria-label="Service"
      className="px-3 py-2 border border-border rounded-lg text-sm bg-card"
      disabled={saving}
      onFocus={async () => {
        if (services.length > 0) return;
        try {
          const res = await fetch("/api/services");
          if (res.ok) setServices(await res.json());
        } catch {
          /* the select just stays empty; the user can retry */
        }
      }}
      onChange={async (e) => {
        const serviceId = e.target.value;
        if (!serviceId) return;
        try {
          setSaving(true);
          await mutateApi(`/api/children/${childId}`, {
            method: "PATCH",
            body: { serviceId },
          });
          toast({ description: "Service updated." });
          onDone();
        } catch (err) {
          toast({
            variant: "destructive",
            description:
              err instanceof Error ? err.message : "Couldn't update the service.",
          });
        } finally {
          setSaving(false);
        }
      }}
      defaultValue=""
    >
      <option value="">
        {saving ? "Saving…" : "Set service…"}
      </option>
      {services.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
