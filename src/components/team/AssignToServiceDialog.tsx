"use client";

/**
 * AssignToServiceDialog — Teams page row action.
 *
 * Bulk-assigns a staff member to one or more services in a single save.
 * Pre-checks + greys out services where the user is already primary or
 * has an active membership row — those can't be unchecked here.
 *
 * Only ADDS memberships. Edit / remove flows live on the per-service
 * Staff tab.
 */

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { useServices, type ServiceSummary } from "@/hooks/useServices";
import {
  useUserServiceMemberships,
  useBulkAssignServices,
  type BulkAssignItem,
} from "@/hooks/useUserServiceMemberships";
import type { ServiceAccessLevel } from "@/hooks/useServiceStaff";

interface SelectionDraft {
  selected: boolean;
  roleAtService: string;
  accessLevel: ServiceAccessLevel;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AssignToServiceDialog({
  userId,
  userName,
  onClose,
}: {
  userId: string;
  userName: string;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Record<string, SelectionDraft>>({});

  const { data: services = [], isLoading: servicesLoading } = useServices();
  const { data: memberships, isLoading: membershipsLoading } =
    useUserServiceMemberships(userId);
  const bulk = useBulkAssignServices(userId);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...services].sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return sorted;
    return sorted.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q),
    );
  }, [services, search]);

  function rowStatusLabel(svcId: string): "primary" | "additional" | null {
    if (memberships?.primaryServiceId === svcId) return "primary";
    if (memberships?.memberships.some((m) => m.serviceId === svcId))
      return "additional";
    return null;
  }

  function toggle(svcId: string) {
    setDraft((d) => {
      const current = d[svcId];
      if (current) {
        const next = { ...d };
        delete next[svcId];
        return next;
      }
      return {
        ...d,
        [svcId]: { selected: true, roleAtService: "", accessLevel: "contributor" },
      };
    });
  }

  function updateDraft(svcId: string, patch: Partial<SelectionDraft>) {
    setDraft((d) => {
      const existing = d[svcId];
      if (!existing) return d;
      return { ...d, [svcId]: { ...existing, ...patch } };
    });
  }

  const items: BulkAssignItem[] = Object.entries(draft)
    .filter(([, v]) => v.selected && v.roleAtService.trim().length > 0)
    .map(([serviceId, v]) => ({
      serviceId,
      roleAtService: v.roleAtService.trim(),
      accessLevel: v.accessLevel,
      startDate: todayIso(),
    }));

  const hasDraftRows = Object.keys(draft).length > 0;
  const hasIncomplete =
    hasDraftRows && items.length !== Object.keys(draft).length;
  const canSubmit = items.length > 0 && !hasIncomplete;

  function handleSubmit() {
    if (!canSubmit) return;
    bulk.mutate(
      { items },
      {
        onSuccess: () => onClose(),
      },
    );
  }

  const loading = servicesLoading || membershipsLoading;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <DialogTitle className="text-lg font-semibold text-foreground">
          Assign {userName} to services
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted">
          Pick services to add. Services they&apos;re already assigned to are
          checked + locked here — manage those from the service&apos;s Staff
          tab.
        </DialogDescription>

        <div className="mt-4 relative max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search services…"
            className={cn(
              "w-full pl-9 pr-3 py-2 text-sm rounded-[var(--radius-sm)]",
              "border border-[color:var(--color-border)]",
              "bg-[color:var(--color-cream-soft)]",
              "focus:outline-none focus:ring-2 focus:ring-[color:var(--color-brand)]",
            )}
          />
        </div>

        <div className="mt-3 max-h-96 overflow-y-auto rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-cream-soft)]">
          {loading ? (
            <div className="p-6 text-sm text-muted">Loading services…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-sm text-muted">No services found.</div>
          ) : (
            <ul className="divide-y divide-[color:var(--color-border)]">
              {filtered.map((svc) => {
                const status = rowStatusLabel(svc.id);
                const isAssigned = status !== null;
                const isChecked = isAssigned || !!draft[svc.id]?.selected;
                return (
                  <li key={svc.id} className="p-3">
                    <ServiceRow
                      service={svc}
                      checked={isChecked}
                      disabled={isAssigned}
                      assignedLabel={
                        status === "primary"
                          ? "Primary"
                          : status === "additional"
                            ? "Additional"
                            : null
                      }
                      onToggle={() => !isAssigned && toggle(svc.id)}
                    />
                    {!isAssigned && draft[svc.id]?.selected ? (
                      <DraftFields
                        roleAtService={draft[svc.id]!.roleAtService}
                        accessLevel={draft[svc.id]!.accessLevel}
                        onChange={(patch) => updateDraft(svc.id, patch)}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {hasIncomplete ? (
          <p className="mt-3 text-xs text-amber-700">
            Each newly-checked service needs a &ldquo;Role at service&rdquo;
            before you can save.
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={bulk.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={!canSubmit}
            loading={bulk.isPending}
          >
            Save assignments
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ServiceRow({
  service,
  checked,
  disabled,
  assignedLabel,
  onToggle,
}: {
  service: ServiceSummary;
  checked: boolean;
  disabled: boolean;
  assignedLabel: string | null;
  onToggle: () => void;
}) {
  return (
    <label
      className={cn(
        "flex items-center gap-3 cursor-pointer",
        disabled && "cursor-not-allowed opacity-70",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
        className="w-4 h-4 accent-[color:var(--color-brand)]"
        aria-label={`Assign ${service.name}`}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {service.name}
        </p>
        <p className="text-xs text-muted truncate">{service.code}</p>
      </div>
      {assignedLabel ? (
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0 text-2xs font-bold uppercase tracking-wide",
            assignedLabel === "Primary"
              ? "border-emerald-300 dark:border-emerald-800 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200"
              : "border-blue-300 dark:border-blue-800 bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-200",
          )}
        >
          Already assigned · {assignedLabel}
        </span>
      ) : null}
    </label>
  );
}

function DraftFields({
  roleAtService,
  accessLevel,
  onChange,
}: {
  roleAtService: string;
  accessLevel: ServiceAccessLevel;
  onChange: (patch: Partial<SelectionDraft>) => void;
}) {
  return (
    <div className="mt-2 ml-7 grid grid-cols-1 sm:grid-cols-2 gap-2">
      <label className="block">
        <span className="block text-2xs font-medium text-muted uppercase tracking-wide mb-1">
          Role at service
        </span>
        <input
          type="text"
          value={roleAtService}
          maxLength={50}
          placeholder="Educator, Room Leader, Cook…"
          onChange={(e) => onChange({ roleAtService: e.target.value })}
          className="w-full px-2 py-1.5 text-sm rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-card focus:outline-none focus:ring-2 focus:ring-[color:var(--color-brand)]"
        />
      </label>
      <label className="block">
        <span className="block text-2xs font-medium text-muted uppercase tracking-wide mb-1">
          Access level
        </span>
        <select
          value={accessLevel}
          onChange={(e) =>
            onChange({ accessLevel: e.target.value as ServiceAccessLevel })
          }
          className="w-full px-2 py-1.5 text-sm rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-card focus:outline-none focus:ring-2 focus:ring-[color:var(--color-brand)]"
        >
          <option value="view_only">View only</option>
          <option value="contributor">Contributor</option>
          <option value="admin">Admin</option>
        </select>
      </label>
    </div>
  );
}
