"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { AlertTriangle, Save, CalendarClock } from "lucide-react";
import { toast } from "@/hooks/useToast";
import { mutateApi } from "@/lib/fetch-api";
import { isAdminRole } from "@/lib/role-permissions";
import type { Role } from "@prisma/client";
import {
  casualBookingSettingsSchema,
  type CasualBookingSettings,
} from "@/lib/service-settings";
import { cn } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────
const SESSION_TYPES = ["bsc", "asc", "vc"] as const;
type SessionType = (typeof SESSION_TYPES)[number];

const SESSION_LABELS: Record<SessionType, string> = {
  bsc: "Before School Care (BSC)",
  asc: "After School Care (ASC)",
  vc: "Vacation Care (VC)",
};

const SESSION_SHORT: Record<SessionType, string> = {
  bsc: "BSC",
  asc: "ASC",
  vc: "VC",
};

const DAYS: {
  key: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  label: string;
}[] = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

const defaultSessionSetting = {
  enabled: false,
  fee: 0,
  spots: 0,
  cutOffHours: 24,
  days: [] as CasualBookingSettings["bsc"] extends { days: infer D } ? D : never,
};

const defaultSettings: Required<{
  bsc: NonNullable<CasualBookingSettings["bsc"]>;
  asc: NonNullable<CasualBookingSettings["asc"]>;
  vc: NonNullable<CasualBookingSettings["vc"]>;
}> = {
  bsc: { ...defaultSessionSetting, days: [] },
  asc: { ...defaultSessionSetting, days: [] },
  vc: { ...defaultSessionSetting, days: [] },
};

type SessionSetting = NonNullable<CasualBookingSettings["bsc"]>;
type SettingsBlob = {
  bsc: SessionSetting;
  asc: SessionSetting;
  vc: SessionSetting;
};

function parseInitial(
  raw: unknown,
): SettingsBlob {
  const parsed = casualBookingSettingsSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      bsc: { ...defaultSettings.bsc },
      asc: { ...defaultSettings.asc },
      vc: { ...defaultSettings.vc },
    };
  }
  return {
    bsc: parsed.data.bsc ?? { ...defaultSettings.bsc },
    asc: parsed.data.asc ?? { ...defaultSettings.asc },
    vc: parsed.data.vc ?? { ...defaultSettings.vc },
  };
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

// ── Component ─────────────────────────────────────────────────

interface Service {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  casualBookingSettings?: any;
}

export function ServiceCasualBookingsTab({ service }: { service: Service }) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const role = session?.user?.role as Role | undefined;
  const sessionServiceId =
    (session?.user as { serviceId?: string | null } | undefined)?.serviceId ??
    null;
  const canEdit =
    isAdminRole(role) ||
    (role === "coordinator" && sessionServiceId === service.id);

  const [settings, setSettings] = useState<SettingsBlob>(() =>
    parseInitial(service.casualBookingSettings),
  );

  const saveMutation = useMutation({
    mutationFn: (payload: SettingsBlob) =>
      mutateApi(`/api/services/${service.id}/casual-settings`, {
        method: "PATCH",
        body: payload,
      }),
    onSuccess: () => {
      toast({ description: "Casual booking settings saved." });
      queryClient.invalidateQueries({ queryKey: ["service", service.id] });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Something went wrong",
      });
    },
  });

  function updateSession(
    type: SessionType,
    patch: Partial<SessionSetting>,
  ) {
    setSettings((prev) => ({
      ...prev,
      [type]: { ...prev[type], ...patch },
    }));
  }

  function toggleDay(type: SessionType, day: SessionSetting["days"][number]) {
    setSettings((prev) => {
      const existing = prev[type].days;
      const nextDays = existing.includes(day)
        ? existing.filter((d) => d !== day)
        : [...existing, day];
      return { ...prev, [type]: { ...prev[type], days: nextDays } };
    });
  }

  const previewLines = useMemo(() => {
    return SESSION_TYPES.map((t) => {
      const s = settings[t];
      if (!s.enabled) return null;
      return `Parents can book casual ${SESSION_SHORT[t]} up to ${s.cutOffHours} hours before the session at ${formatCurrency(s.fee)} (${s.spots} ${s.spots === 1 ? "spot" : "spots"} available).`;
    }).filter((line): line is string => line !== null);
  }, [settings]);

  function handleSave() {
    saveMutation.mutate(settings);
  }

  return (
    <div className="space-y-6">
      {/* ── Info banner ─────────────────────────────────────── */}
      <div
        role="status"
        className="flex items-start gap-3 p-4 rounded-xl border border-yellow-200 bg-yellow-50 text-yellow-900"
      >
        <AlertTriangle className="w-5 h-5 text-yellow-700 shrink-0 mt-0.5" />
        <div className="text-sm leading-snug">
          <p className="font-medium">Settings stored — not yet enforced</p>
          <p className="text-yellow-800/90">
            These settings are saved against the service but are{" "}
            <strong>not yet enforced</strong> against parent-portal bookings.
            Enforcement ships in a follow-up sub-project.
          </p>
        </div>
      </div>

      {/* ── Preview card ────────────────────────────────────── */}
      <div className="p-4 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 mb-2">
          <CalendarClock className="w-4 h-4 text-brand" />
          <h3 className="text-sm font-semibold text-foreground">
            Policy preview
          </h3>
        </div>
        {previewLines.length === 0 ? (
          <p className="text-sm text-muted italic">
            No sessions enabled. Enable a session below to preview its policy.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {previewLines.map((line, i) => (
              <li key={i} className="text-sm text-foreground">
                {line}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Three session cards ─────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {SESSION_TYPES.map((type) => {
          const s = settings[type];
          return (
            <div
              key={type}
              className="p-4 rounded-xl border border-border bg-card space-y-4"
              data-testid={`casual-card-${type}`}
            >
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground">
                  {SESSION_LABELS[type]}
                </h4>
                <label className="inline-flex items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    disabled={!canEdit}
                    onChange={(e) =>
                      updateSession(type, { enabled: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                    aria-label={`Enable casual bookings for ${SESSION_SHORT[type]}`}
                  />
                  Enabled
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-muted">
                  Fee (AUD)
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={s.fee}
                    disabled={!canEdit}
                    onChange={(e) =>
                      updateSession(type, {
                        fee: Number(e.target.value) || 0,
                      })
                    }
                    className="mt-1 w-full px-2 py-1.5 text-sm border border-border rounded-md bg-bg focus:outline-none focus:ring-2 focus:ring-brand"
                    aria-label={`${SESSION_SHORT[type]} fee`}
                  />
                </label>
                <label className="block text-xs text-muted">
                  Spots
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={s.spots}
                    disabled={!canEdit}
                    onChange={(e) =>
                      updateSession(type, {
                        spots: Math.max(
                          0,
                          Math.floor(Number(e.target.value) || 0),
                        ),
                      })
                    }
                    className="mt-1 w-full px-2 py-1.5 text-sm border border-border rounded-md bg-bg focus:outline-none focus:ring-2 focus:ring-brand"
                    aria-label={`${SESSION_SHORT[type]} spots`}
                  />
                </label>
                <label className="block text-xs text-muted col-span-2">
                  Cut-off (hours before session)
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={s.cutOffHours}
                    disabled={!canEdit}
                    onChange={(e) =>
                      updateSession(type, {
                        cutOffHours: Math.max(
                          0,
                          Math.floor(Number(e.target.value) || 0),
                        ),
                      })
                    }
                    className="mt-1 w-full px-2 py-1.5 text-sm border border-border rounded-md bg-bg focus:outline-none focus:ring-2 focus:ring-brand"
                    aria-label={`${SESSION_SHORT[type]} cut-off hours`}
                  />
                </label>
              </div>

              <div>
                <p className="block text-xs text-muted mb-1.5">
                  Days available
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {DAYS.map((d) => {
                    const checked = s.days.includes(d.key);
                    return (
                      <label
                        key={d.key}
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border cursor-pointer",
                          checked
                            ? "bg-brand text-white border-brand"
                            : "bg-bg text-muted border-border",
                          !canEdit && "cursor-not-allowed opacity-70",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          disabled={!canEdit}
                          onChange={() => toggleDay(type, d.key)}
                          aria-label={`${SESSION_SHORT[type]} ${d.label}`}
                        />
                        {d.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Save button ─────────────────────────────────────── */}
      {canEdit && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-brand text-white hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {saveMutation.isPending ? "Saving…" : "Save settings"}
          </button>
        </div>
      )}
    </div>
  );
}
