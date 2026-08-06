"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Save, CalendarClock, ShieldCheck } from "lucide-react";
import { toast } from "@/hooks/useToast";
import { ENROLMENTS_EMAIL } from "@/lib/enrol-draft";
import { Button } from "@/components/ui/Button";
import { mutateApi } from "@/lib/fetch-api";
import { isAdminRole } from "@/lib/role-permissions";
import type { Role } from "@prisma/client";
import {
  casualBookingSettingsSchema,
  activeSessionKeys,
  roomFees,
  roomLabel,
  type BookingPolicy,
  type CasualBookingSettings,
  type SessionTimes,
} from "@/lib/service-settings";
import { cn } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────
// Whatever this centre actually runs — the three core programmes plus
// any extra slot they've named in Rooms & fees.
// The card list follows what this centre actually runs — the three core
// programmes plus any extra slot named in Rooms & fees. Computed inside
// the component; this constant is only the type source.
const SESSION_TYPES = [
  "bsc",
  "asc",
  "vc",
  "extra1",
  "extra2",
  "extra3",
  "extra4",
] as const;
type SessionType = (typeof SESSION_TYPES)[number];

/**
 * Fallbacks only. The heading shown is the centre's OWN room name from
 * Service Info → Rooms & fees — "Rise and Shine", "Amana Afternoons",
 * "Holiday Quest" — because that's what staff and families call them.
 * "Before School Care (BSC)" is the filing code, not the programme.
 */
const SESSION_LABELS: Partial<Record<SessionType, string>> = {
  bsc: "Rise and Shine",
  asc: "Amana Afternoons",
  vc: "Holiday Quest",
};

/** Short form for aria labels. Extra slots fall back to their code. */
const SESSION_SHORT: Partial<Record<SessionType, string>> = {
  bsc: "BSC",
  asc: "ASC",
  vc: "VC",
};

const shortLabel = (t: SessionType) => SESSION_SHORT[t] ?? t;

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
type SettingsBlob = Partial<Record<SessionType, SessionSetting>> & {
  bsc: SessionSetting;
  asc: SessionSetting;
  vc: SessionSetting;
  policy?: BookingPolicy;
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
    policy: parsed.data.policy,
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
    (role === "member" && sessionServiceId === service.id);

  const [settings, setSettings] = useState<SettingsBlob>(() =>
    parseInitial(service.casualBookingSettings),
  );
  const sessionTimes =
    (service as { sessionTimes?: SessionTimes | null }).sessionTimes ?? null;
  const activeTypes = activeSessionKeys(sessionTimes) as SessionType[];

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
      // A slot the centre has just named has no settings row yet.
      const existing = prev[type]?.days ?? [];
      const nextDays = existing.includes(day)
        ? existing.filter((d) => d !== day)
        : [...existing, day];
      return { ...prev, [type]: { ...prev[type], days: nextDays } };
    });
  }

  const previewLines = useMemo(() => {
    return activeTypes.map((t) => {
      const s = settings[t];
      if (!s?.enabled) return null;
      return `Parents can book casual ${roomLabel(sessionTimes, t)} up to ${s.cutOffHours} hours before the session at ${formatCurrency(s.fee)} (${s.spots} ${s.spots === 1 ? "spot" : "spots"} available).`;
    }).filter((line): line is string => line !== null);
  }, [settings, activeTypes, sessionTimes]);

  function handleSave() {
    saveMutation.mutate(settings);
  }

  return (
    <div className="space-y-6">
      {/* ── What's actually enforced ────────────────────────
          This banner used to say "settings stored — not yet enforced".
          That stopped being true when checkCasualBookingAllowed landed
          and was wired into the parent create + bulk routes and the
          cancellation route, but nobody deleted the warning. A stale
          warning is worse than none: it tells a coordinator their
          policy is decorative, so they stop trusting the settings. */}
      <div
        role="status"
        className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card"
      >
        <ShieldCheck className="w-5 h-5 text-brand shrink-0 mt-0.5" />
        <div className="text-sm leading-snug">
          <p className="font-medium text-foreground">
            These settings are enforced
          </p>
          <p className="text-muted">
            Every one of them is checked on the server when a family books
            through the app: the session has to be switched on, the day has
            to be one you run, the cut-off has to be met, and there has to
            be a spot left. Cancellation follows the policy below.
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

      {/* Families are offered a programme only once it's ENABLED below.
          An unnamed extra room, or Holiday Quest at a centre that
          doesn't run vacation care, must never appear on their booking
          form — so this list is the switch, not a display. */}
      <p className="text-xs text-muted">
        Parents can only book a programme that&apos;s enabled here. To add
        another — a homework club, an early-finish session — name a spare
        room under{" "}
        <strong className="text-foreground">
          Service Information → Rooms &amp; fees
        </strong>
        , then enable it below.
      </p>

      {/* ── One card per programme this centre runs ──────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {activeTypes.map((type) => {
          // A slot named a moment ago has no saved settings row yet, so
          // it starts from the defaults rather than crashing the card.
          const s = settings[type] ?? { ...defaultSessionSetting, days: [] };
          return (
            <div
              key={type}
              className="p-4 rounded-xl border border-border bg-card space-y-4"
              data-testid={`casual-card-${type}`}
            >
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground">
                  {roomLabel(sessionTimes, type)}
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
                    aria-label={`Enable casual bookings for ${shortLabel(type)}`}
                  />
                  Enabled
                </label>
              </div>

              {/* Price comes from Rooms & fees when a tier is linked, so
                  a fee rise happens once rather than being remembered
                  here as well and quietly diverging. */}
              <label className="block text-xs text-muted mb-3">
                Fee
                <select
                  value={s.feeTierId ?? ""}
                  disabled={!canEdit}
                  onChange={(e) =>
                    updateSession(type, {
                      feeTierId: e.target.value || undefined,
                    })
                  }
                  className="mt-1 w-full px-2 py-1.5 text-sm border border-border rounded-md bg-bg focus:outline-none focus:ring-2 focus:ring-brand"
                  aria-label={`${shortLabel(type)} price source`}
                >
                  <option value="">Use the amount below</option>
                  {roomFees(sessionTimes, type).map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} — {formatCurrency(f.amountCents / 100)}
                    </option>
                  ))}
                </select>
                {roomFees(sessionTimes, type).length === 0 && (
                  <span className="block mt-1 text-2xs text-muted">
                    No fees set for {roomLabel(sessionTimes, type)}
                    {" "}yet — add them under Service Info → Rooms &amp; fees.
                  </span>
                )}
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-muted">
                  Fee (AUD)
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={s.fee}
                    disabled={!canEdit || Boolean(s.feeTierId)}
                    onChange={(e) =>
                      updateSession(type, {
                        fee: Number(e.target.value) || 0,
                      })
                    }
                    className="mt-1 w-full px-2 py-1.5 text-sm border border-border rounded-md bg-bg focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
                    aria-label={`${shortLabel(type)} fee`}
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
                    aria-label={`${shortLabel(type)} spots`}
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
                    aria-label={`${shortLabel(type)} cut-off hours`}
                  />
                </label>
                <label className="block text-xs text-muted col-span-2">
                  Who can book a spot
                  <select
                    value={s.availability ?? "all"}
                    disabled={!canEdit}
                    onChange={(e) =>
                      updateSession(type, {
                        availability: e.target.value as "all" | "enrolled",
                      })
                    }
                    className="mt-1 w-full px-2 py-1.5 text-sm border border-border rounded-md bg-bg focus:outline-none focus:ring-2 focus:ring-brand"
                    aria-label={`${shortLabel(type)} who can book`}
                  >
                    <option value="all">Any family at the centre</option>
                    <option value="enrolled">
                      Only children already booked into this room
                    </option>
                  </select>
                  <span className="mt-1 block text-2xs">
                    Vacation care usually takes anyone; term-time before and
                    after school care often only has room for the families
                    already in it.
                  </span>
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
                          aria-label={`${shortLabel(type)} ${d.label}`}
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

      {/* ── Booking policy ──────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Booking policy
          </h3>
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(settings.policy?.blockCasualCancellation)}
            disabled={!canEdit}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                policy: {
                  ...prev.policy,
                  blockCasualCancellation: e.target.checked,
                },
              }))
            }
            className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand"
          />
          <span className="text-sm text-foreground">
            Casual bookings can&apos;t be cancelled at all
            <span className="block text-xs text-muted">
              For centres that cost a casual place the moment it&apos;s taken.
              Off: families can cancel up to each session&apos;s cut-off above.
            </span>
          </span>
        </label>

        {/* Not a setting. A rule families have to look up per centre
            isn't one they'll follow, and every centre rosters on the
            same weekly cycle. */}
        <div className="pt-3 border-t border-border">
          <p className="text-sm text-foreground">Recurring bookings</p>
          <p className="text-xs text-muted mt-0.5">
            Families <strong>can&apos;t cancel</strong> a regular weekly
            booking in the app. To skip a single day they mark the child as{" "}
            <strong>not attending</strong>, which keeps the place; to change
            the pattern itself they email{" "}
            <strong>{ENROLMENTS_EMAIL}</strong>, because that&apos;s an
            enrolment change with fee and CCS consequences. This applies at
            every centre and isn&apos;t configurable here.
          </p>
        </div>
      </div>

      {/* ── Save button ─────────────────────────────────────── */}
      {canEdit && (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            loading={saveMutation.isPending}
            iconLeft={<Save className="w-4 h-4" />}
          >
            {saveMutation.isPending ? "Saving…" : "Save settings"}
          </Button>
        </div>
      )}
    </div>
  );
}
