"use client";

/**
 * Service Information → Centre details (2026-10-08, modelled on OWNA's
 * "Centre's Information"): ONE always-editable form instead of a read-only
 * card with a pencil. Every field has a bold label and a grey note saying
 * where the value shows up, so nobody has to guess what changing it does.
 * One "Save changes" button sends only the fields that changed.
 *
 * Status is admin-only — it used to be a row of buttons any coordinator
 * could press, including "Closed".
 */
import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Save } from "lucide-react";
import { useUpdateService } from "@/hooks/useServices";
import { isAdminRole } from "@/lib/role-permissions";
import { AUSTRALIAN_STATES } from "@/lib/service-scope";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const STATUSES = [
  { value: "active", label: "Active" },
  { value: "onboarding", label: "Onboarding" },
  { value: "pipeline", label: "Pipeline" },
  { value: "closing", label: "Closing" },
  { value: "closed", label: "Closed" },
];

interface Values {
  name: string;
  code: string;
  status: string;
  address: string;
  suburb: string;
  state: string;
  postcode: string;
  phone: string;
  email: string;
  operatingDays: string;
  capacity: string;
  serviceApprovalNumber: string;
  providerApprovalNumber: string;
  managerId: string;
  notes: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromService(s: any): Values {
  return {
    name: s.name ?? "",
    code: s.code ?? "",
    status: s.status ?? "active",
    address: s.address ?? "",
    suburb: s.suburb ?? "",
    state: s.state ?? "",
    postcode: s.postcode ?? "",
    phone: s.phone ?? "",
    email: s.email ?? "",
    operatingDays: s.operatingDays ?? "",
    capacity: s.capacity != null ? String(s.capacity) : "",
    serviceApprovalNumber: s.serviceApprovalNumber ?? "",
    providerApprovalNumber: s.providerApprovalNumber ?? "",
    managerId: s.managerId ?? "",
    notes: s.notes ?? "",
  };
}

const inputClass =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand disabled:bg-surface/60 disabled:text-muted";

/** OWNA-style field: bold label, input, grey "where this shows" note. */
export function Field({
  label,
  required,
  note,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  note?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="block text-sm font-semibold text-foreground mb-1">
        {label}
        {required && <span className="text-red-600 dark:text-red-400"> *</span>}
      </span>
      {children}
      {note && <span className="block text-xs text-muted mt-1">{note}</span>}
    </label>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-xs font-semibold uppercase tracking-wider text-brand border-b border-border pb-1.5 mb-3 mt-2">
      {children}
    </h4>
  );
}

export function CentreDetailsForm({
  service,
  users,
  canEdit,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: any;
  users: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const { data: session } = useSession();
  const isAdmin = isAdminRole(session?.user?.role);
  const update = useUpdateService();
  const initial = useMemo(() => fromService(service), [service]);
  const [values, setValues] = useState<Values>(initial);
  // Re-seed when the saved centre changes underneath us (after a save, or
  // switching centre) — adjusted during render, not in an effect.
  const [seededFrom, setSeededFrom] = useState(initial);
  if (seededFrom !== initial) {
    setSeededFrom(initial);
    setValues(initial);
  }

  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  const changed = (Object.keys(values) as (keyof Values)[]).filter((k) => values[k] !== initial[k]);
  const dirty = changed.length > 0;
  const invalid = !values.name.trim() || (values.capacity !== "" && Number.isNaN(Number(values.capacity)));

  function save() {
    const patch: Record<string, unknown> = { id: service.id };
    for (const k of changed) {
      if (k === "capacity") patch.capacity = values.capacity === "" ? null : parseInt(values.capacity, 10);
      else if (k === "managerId") patch.managerId = values.managerId || null;
      else if (k === "serviceApprovalNumber" || k === "providerApprovalNumber") patch[k] = values[k] || null;
      else if (k === "status" && !isAdmin) continue;
      else patch[k] = values[k];
    }
    update.mutate(patch as never);
  }

  const disabled = !canEdit || update.isPending;

  return (
    <div className="space-y-5" data-testid="centre-details-form">
      <section>
        <SectionHeading>Centre</SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Centre name" required note="Shown to families in the app, on enrolment forms and invoices.">
            <input className={inputClass} value={values.name} onChange={set("name")} disabled={disabled} />
          </Field>
          <Field label="Centre code" note="The short code used across reports and the dashboard, e.g. AIA-COB.">
            <input className={inputClass} value={values.code} onChange={set("code")} disabled={disabled} />
          </Field>
          <Field
            label="Status"
            note={isAdmin ? "Where this centre sits in the network — active, opening, or winding down." : "Only an admin can change this."}
          >
            <select className={inputClass} value={values.status} onChange={set("status")} disabled={disabled || !isAdmin}>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Operating days" note="E.g. Mon–Fri. Shown to families with the centre's details.">
            <input className={inputClass} value={values.operatingDays} onChange={set("operatingDays")} disabled={disabled} placeholder="Mon–Fri" />
          </Field>
        </div>
      </section>

      <section>
        <SectionHeading>Address</SectionHeading>
        <div className="grid gap-4 sm:grid-cols-6">
          <Field label="Street address" className="sm:col-span-6" note="Shown to families in the app and used on enrolment packs.">
            <input className={inputClass} value={values.address} onChange={set("address")} disabled={disabled} />
          </Field>
          <Field label="Suburb" className="sm:col-span-3">
            <input className={inputClass} value={values.suburb} onChange={set("suburb")} disabled={disabled} />
          </Field>
          <Field label="State" className="sm:col-span-2" note="Decides which state-only policies this centre sees.">
            <select className={inputClass} value={values.state} onChange={set("state")} disabled={disabled}>
              <option value="">Choose…</option>
              {AUSTRALIAN_STATES.map((s) => (
                <option key={s.value} value={s.value}>{s.value}</option>
              ))}
            </select>
          </Field>
          <Field label="Postcode" className="sm:col-span-1">
            <input className={inputClass} value={values.postcode} onChange={set("postcode")} disabled={disabled} inputMode="numeric" />
          </Field>
        </div>
      </section>

      <section>
        <SectionHeading>Contact</SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone" required note="Families' main number for this centre — shown in the app.">
            <input className={inputClass} value={values.phone} onChange={set("phone")} disabled={disabled} inputMode="tel" />
          </Field>
          <Field
            label="Email"
            required
            note="Receives this centre's mail. The dashboard login with this exact email becomes the centre's own account."
          >
            <input className={inputClass} value={values.email} onChange={set("email")} disabled={disabled} type="email" />
          </Field>
        </div>
      </section>

      <section>
        <SectionHeading>Approvals &amp; places</SectionHeading>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Approved places" note="Your licensed number of places — used for occupancy and the room capacity check.">
            <input className={inputClass} value={values.capacity} onChange={set("capacity")} disabled={disabled} inputMode="numeric" />
          </Field>
          <Field label="Service approval number" note="From the regulator (SE-…). Shown to families on their enrolment confirmation.">
            <input className={inputClass} value={values.serviceApprovalNumber} onChange={set("serviceApprovalNumber")} disabled={disabled} />
          </Field>
          <Field label="Provider approval number" note="From the regulator (PR-…). Shown with the service approval.">
            <input className={inputClass} value={values.providerApprovalNumber} onChange={set("providerApprovalNumber")} disabled={disabled} />
          </Field>
        </div>
      </section>

      <section>
        <SectionHeading>Management</SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Centre manager" note="Responsible for this centre in the dashboard — sees its staff records and its escalations.">
            <select className={inputClass} value={values.managerId} onChange={set("managerId")} disabled={disabled}>
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Notes" note="Internal — only staff see these." className="sm:col-span-2">
            <textarea className={cn(inputClass, "resize-y")} rows={3} value={values.notes} onChange={set("notes")} disabled={disabled} />
          </Field>
        </div>
      </section>

      {canEdit && (
        <div className="sticky bottom-3 flex items-center justify-end gap-3 rounded-xl border border-border bg-card/95 backdrop-blur px-4 py-3">
          <span className="text-xs text-muted mr-auto">
            {dirty ? `${changed.length} unsaved change${changed.length === 1 ? "" : "s"}` : "All changes saved"}
          </span>
          {dirty && (
            <Button variant="ghost" size="sm" onClick={() => setValues(initial)} disabled={update.isPending}>
              Undo
            </Button>
          )}
          <Button size="sm" onClick={save} disabled={!dirty || invalid || update.isPending}>
            <Save className="w-4 h-4" aria-hidden />
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      )}
    </div>
  );
}
