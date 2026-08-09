"use client";

/**
 * The centre's fee policy — everything charged around the session fee.
 *
 * This sits directly under Rooms & fees because it answers the questions
 * that room prices don't: what a 6:45pm pickup costs, what an absence
 * costs, what cancelling costs. Those answers previously lived on a PDF
 * fee schedule and in people's heads, which is why no two staff gave a
 * family the same one.
 *
 * The card is deliberately readable when everything is off — a centre
 * that charges no extras should see "No extra charges configured" and a
 * short list of what it COULD set, not five collapsed empty forms. The
 * detail only unfolds once a switch is on, so the common case stays a
 * glance rather than a scroll.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, DollarSign, CalendarX, Receipt, Ban } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { formatCents, parseDollarsToCents } from "@/lib/family-billing";
import {
  calculateLateFeeCents,
  type FeePolicy,
  type ResolvedFeePolicy,
} from "@/lib/fee-policy";

/**
 * The fully-resolved shape the GET endpoint always returns — shared with
 * the server so the card can't drift from what it's sent.
 */
type ResolvedPolicy = ResolvedFeePolicy;

const field =
  "w-full px-3 py-2.5 border border-border rounded-lg text-base sm:text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand/30";
const narrow = `${field} max-w-[9rem]`;

const DAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" },
];

/** Cents → the editable dollar string, with "" for "not set". */
const toDollars = (cents: number | undefined | null): string =>
  cents === undefined || cents === null ? "" : (cents / 100).toFixed(2);

export function FeePolicyCard({
  serviceId,
  canEdit,
}: {
  serviceId: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const key = ["service", serviceId, "fee-policy"];
  const [draft, setDraft] = useState<ResolvedPolicy | null>(null);
  /**
   * Bumped whenever the draft is thrown away, and used as the card's
   * `key`.
   *
   * The money inputs are uncontrolled (`defaultValue` + `onBlur`) so a
   * half-typed "12." doesn't round-trip through cents on every
   * keystroke. The cost of that is React won't reset them when the draft
   * goes — pressing Cancel would clear the draft while leaving the typed
   * numbers on screen, which reads as "my edit was kept". Remounting is
   * the cheap, obviously-correct fix.
   */
  const [resetNonce, setResetNonce] = useState(0);
  const discardDraft = () => {
    setDraft(null);
    setResetNonce((n) => n + 1);
  };

  const { data, isLoading } = useQuery<{ settings: ResolvedPolicy }>({
    queryKey: key,
    queryFn: () => fetchApi(`/api/services/${serviceId}/fee-policy`),
    retry: 1,
  });

  const save = useMutation({
    mutationFn: (body: FeePolicy) =>
      mutateApi(`/api/services/${serviceId}/fee-policy`, {
        method: "PATCH",
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      discardDraft();
      toast({ description: "Fee policy saved." });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  if (isLoading) return <Skeleton className="h-64 w-full rounded-lg" />;

  const current = draft ?? data?.settings ?? null;
  if (!current) return null;
  const dirty = draft !== null;

  /** Merge a patch into one group, leaving the others untouched. */
  const set = <K extends keyof ResolvedPolicy>(
    group: K,
    patch: Partial<ResolvedPolicy[K]>,
  ) =>
    setDraft({
      ...current,
      [group]: { ...(current[group] as object), ...patch },
    } as ResolvedPolicy);

  /**
   * Money inputs are held as strings while typing, so a half-typed
   * "12." doesn't round-trip to 1200 cents mid-keystroke. An
   * unparseable value clears the field rather than saving a guess.
   */
  const money = (raw: string): number | undefined => {
    const cents = parseDollarsToCents(raw);
    return cents === null || cents === undefined ? undefined : cents;
  };

  const anythingCharged =
    current.lateCollection.enabled ||
    current.cancellation.enabled ||
    current.absence.notified !== "full" ||
    current.absence.unnotified !== "full" ||
    current.onboarding.enrolmentFeeCents !== undefined ||
    current.onboarding.bondCents !== undefined ||
    current.onboarding.annualAdminFeeCents !== undefined ||
    current.payment.latePaymentFeeCents !== undefined;

  return (
    <div
      key={resetNonce}
      className="rounded-lg border border-border bg-card p-5 space-y-5"
    >
      <div>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Receipt className="h-4 w-4 text-brand" />
          Fee policy
        </h3>
        <p className="text-xs text-muted mt-0.5">
          What families are charged beyond the session fee. Everything here
          starts off — nothing is charged until you turn it on.
        </p>
      </div>

      {!anythingCharged && !canEdit && (
        <p className="text-sm text-muted">No extra charges configured.</p>
      )}

      {/* ── Late collection ─────────────────────────────────────── */}
      <Section
        icon={Clock}
        title="Late collection"
        summary={
          current.lateCollection.enabled
            ? describeLateFee(current.lateCollection)
            : "Not charged"
        }
      >
        <Toggle
          label="Charge for late collection"
          checked={current.lateCollection.enabled}
          disabled={!canEdit}
          onChange={(v) => set("lateCollection", { enabled: v })}
        />
        {current.lateCollection.enabled && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Labelled label="How it's charged">
              <select
                className={field}
                disabled={!canEdit}
                value={current.lateCollection.basis}
                onChange={(e) =>
                  set("lateCollection", {
                    basis: e.target.value as ResolvedPolicy["lateCollection"]["basis"],
                  })
                }
              >
                <option value="per_block">Per block of time (or part thereof)</option>
                <option value="per_minute">Per minute</option>
                <option value="flat">One flat charge</option>
              </select>
            </Labelled>
            <Labelled label="Amount">
              <input
                className={narrow}
                inputMode="decimal"
                disabled={!canEdit}
                defaultValue={toDollars(current.lateCollection.amountCents)}
                onBlur={(e) =>
                  set("lateCollection", {
                    amountCents: money(e.target.value) ?? 0,
                  })
                }
              />
            </Labelled>
            {current.lateCollection.basis === "per_block" && (
              <Labelled
                label="Block length (minutes)"
                help="15 is the sector norm — “$15 per 15 minutes or part thereof”."
              >
                <input
                  className={narrow}
                  inputMode="numeric"
                  disabled={!canEdit}
                  defaultValue={current.lateCollection.blockMinutes}
                  onBlur={(e) =>
                    set("lateCollection", {
                      blockMinutes: Math.max(1, Number(e.target.value) || 15),
                    })
                  }
                />
              </Labelled>
            )}
            <Labelled
              label="Grace period (minutes)"
              help="Nothing is charged inside this window."
            >
              <input
                className={narrow}
                inputMode="numeric"
                disabled={!canEdit}
                defaultValue={current.lateCollection.graceMinutes}
                onBlur={(e) =>
                  set("lateCollection", {
                    graceMinutes: Math.max(0, Number(e.target.value) || 0),
                  })
                }
              />
            </Labelled>
            <Labelled
              label="Cap per occurrence"
              help="Blank means no cap. Worth setting — an uncapped per-minute fee produces invoices nobody wants to send."
            >
              <input
                className={narrow}
                inputMode="decimal"
                placeholder="No cap"
                disabled={!canEdit}
                defaultValue={toDollars(current.lateCollection.maxPerOccurrenceCents)}
                onBlur={(e) =>
                  set("lateCollection", {
                    maxPerOccurrenceCents: money(e.target.value),
                  })
                }
              />
            </Labelled>
          </div>
        )}
      </Section>

      {/* ── Absences ────────────────────────────────────────────── */}
      <Section
        icon={CalendarX}
        title="Absences"
        summary={`Notified: ${describeAbsence(
          current.absence.notified,
          current.absence.notifiedPercent,
        )} · Not notified: ${describeAbsence(
          current.absence.unnotified,
          current.absence.unnotifiedPercent,
        )}`}
      >
        <p className="text-xs text-muted">
          Under CCS an absence is usually still claimable, so most centres
          charge the full fee either way. Charging less for a notified absence
          is how you reward the phone call.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Labelled label="Notified absence">
            <select
              className={field}
              disabled={!canEdit}
              value={current.absence.notified}
              onChange={(e) =>
                set("absence", {
                  notified: e.target.value as ResolvedPolicy["absence"]["notified"],
                })
              }
            >
              <option value="full">Charge the full fee</option>
              <option value="percent">Charge a percentage</option>
              <option value="none">Charge nothing</option>
            </select>
          </Labelled>
          {current.absence.notified === "percent" && (
            <Labelled label="Percentage of fee">
              <input
                className={narrow}
                inputMode="numeric"
                disabled={!canEdit}
                defaultValue={current.absence.notifiedPercent}
                onBlur={(e) =>
                  set("absence", {
                    notifiedPercent: clampPercent(e.target.value),
                  })
                }
              />
            </Labelled>
          )}
          <Labelled label="Absence without notice">
            <select
              className={field}
              disabled={!canEdit}
              value={current.absence.unnotified}
              onChange={(e) =>
                set("absence", {
                  unnotified: e.target
                    .value as ResolvedPolicy["absence"]["unnotified"],
                })
              }
            >
              <option value="full">Charge the full fee</option>
              <option value="percent">Charge a percentage</option>
              <option value="none">Charge nothing</option>
            </select>
          </Labelled>
          {current.absence.unnotified === "percent" && (
            <Labelled label="Percentage of fee">
              <input
                className={narrow}
                inputMode="numeric"
                disabled={!canEdit}
                defaultValue={current.absence.unnotifiedPercent}
                onBlur={(e) =>
                  set("absence", {
                    unnotifiedPercent: clampPercent(e.target.value),
                  })
                }
              />
            </Labelled>
          )}
          <Labelled
            label="Notice required (hours)"
            help="How much warning counts as notified."
          >
            <input
              className={narrow}
              inputMode="numeric"
              disabled={!canEdit}
              defaultValue={current.absence.notifyHours}
              onBlur={(e) =>
                set("absence", {
                  notifyHours: Math.max(0, Number(e.target.value) || 0),
                })
              }
            />
          </Labelled>
          <Labelled
            label="No-show fee"
            help="Additional, and only when the family didn't tell you. Blank means none."
          >
            <input
              className={narrow}
              inputMode="decimal"
              placeholder="None"
              disabled={!canEdit}
              defaultValue={toDollars(current.absence.noShowFeeCents)}
              onBlur={(e) =>
                set("absence", { noShowFeeCents: money(e.target.value) })
              }
            />
          </Labelled>
        </div>
      </Section>

      {/* ── Cancellations ───────────────────────────────────────── */}
      <Section
        icon={Ban}
        title="Casual cancellations"
        summary={
          current.cancellation.enabled
            ? `${
                current.cancellation.basis === "flat"
                  ? formatCents(current.cancellation.amountCents)
                  : `${current.cancellation.percentOfFee}% of the fee`
              } inside ${current.cancellation.withinHours}h`
            : "Not charged"
        }
      >
        <Toggle
          label="Charge for late cancellation"
          checked={current.cancellation.enabled}
          disabled={!canEdit}
          onChange={(v) => set("cancellation", { enabled: v })}
        />
        {current.cancellation.enabled && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Labelled label="Applies within (hours)">
              <input
                className={narrow}
                inputMode="numeric"
                disabled={!canEdit}
                defaultValue={current.cancellation.withinHours}
                onBlur={(e) =>
                  set("cancellation", {
                    withinHours: Math.max(0, Number(e.target.value) || 0),
                  })
                }
              />
            </Labelled>
            <Labelled label="Charge">
              <select
                className={field}
                disabled={!canEdit}
                value={current.cancellation.basis}
                onChange={(e) =>
                  set("cancellation", {
                    basis: e.target
                      .value as ResolvedPolicy["cancellation"]["basis"],
                  })
                }
              >
                <option value="percent_of_fee">A percentage of the fee</option>
                <option value="flat">A flat amount</option>
              </select>
            </Labelled>
            {current.cancellation.basis === "flat" ? (
              <Labelled label="Amount">
                <input
                  className={narrow}
                  inputMode="decimal"
                  disabled={!canEdit}
                  defaultValue={toDollars(current.cancellation.amountCents)}
                  onBlur={(e) =>
                    set("cancellation", {
                      amountCents: money(e.target.value) ?? 0,
                    })
                  }
                />
              </Labelled>
            ) : (
              <Labelled label="Percentage of fee">
                <input
                  className={narrow}
                  inputMode="numeric"
                  disabled={!canEdit}
                  defaultValue={current.cancellation.percentOfFee}
                  onBlur={(e) =>
                    set("cancellation", {
                      percentOfFee: clampPercent(e.target.value),
                    })
                  }
                />
              </Labelled>
            )}
          </div>
        )}
      </Section>

      {/* ── Joining fees ────────────────────────────────────────── */}
      <Section
        icon={DollarSign}
        title="Enrolment &amp; bond"
        summary={describeOnboarding(current.onboarding)}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Labelled label="Enrolment fee" help="Blank means none.">
            <input
              className={narrow}
              inputMode="decimal"
              placeholder="None"
              disabled={!canEdit}
              defaultValue={toDollars(current.onboarding.enrolmentFeeCents)}
              onBlur={(e) =>
                set("onboarding", { enrolmentFeeCents: money(e.target.value) })
              }
            />
          </Labelled>
          <Labelled label="Charged">
            <select
              className={field}
              disabled={!canEdit}
              value={current.onboarding.enrolmentFeePerChild ? "child" : "family"}
              onChange={(e) =>
                set("onboarding", {
                  enrolmentFeePerChild: e.target.value === "child",
                })
              }
            >
              <option value="family">Once per family</option>
              <option value="child">Per child</option>
            </select>
          </Labelled>
          <Labelled label="Bond / deposit" help="Blank means none.">
            <input
              className={narrow}
              inputMode="decimal"
              placeholder="None"
              disabled={!canEdit}
              defaultValue={toDollars(current.onboarding.bondCents)}
              onBlur={(e) =>
                set("onboarding", { bondCents: money(e.target.value) })
              }
            />
          </Labelled>
          <Labelled label="Annual admin fee" help="Blank means none.">
            <input
              className={narrow}
              inputMode="decimal"
              placeholder="None"
              disabled={!canEdit}
              defaultValue={toDollars(current.onboarding.annualAdminFeeCents)}
              onBlur={(e) =>
                set("onboarding", {
                  annualAdminFeeCents: money(e.target.value),
                })
              }
            />
          </Labelled>
        </div>
        {current.onboarding.bondCents !== undefined && (
          <Toggle
            label="Bond is refundable on exit"
            checked={current.onboarding.bondRefundable}
            disabled={!canEdit}
            onChange={(v) => set("onboarding", { bondRefundable: v })}
          />
        )}
      </Section>

      {/* ── Payment terms ───────────────────────────────────────── */}
      <Section
        icon={Receipt}
        title="Payment terms"
        summary={`${capitalise(current.payment.cycle)}${
          current.payment.debitDay
            ? ` on ${DAYS.find((d) => d.value === current.payment.debitDay)?.label}`
            : ""
        }, ${current.payment.paymentTermsDays}-day terms`}
      >
        <p className="text-xs text-muted">
          This records the policy — it doesn&rsquo;t move money. Statements and
          the overdue-fee workflow quote these numbers so they all say the same
          thing.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Labelled label="Billing cycle">
            <select
              className={field}
              disabled={!canEdit}
              value={current.payment.cycle}
              onChange={(e) =>
                set("payment", {
                  cycle: e.target.value as ResolvedPolicy["payment"]["cycle"],
                })
              }
            >
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="monthly">Monthly</option>
            </select>
          </Labelled>
          <Labelled label="Debit day">
            <select
              className={field}
              disabled={!canEdit}
              value={current.payment.debitDay ?? ""}
              onChange={(e) =>
                set("payment", {
                  debitDay: e.target.value ? Number(e.target.value) : null,
                })
              }
            >
              <option value="">Not set</option>
              {DAYS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </Labelled>
          <Labelled label="Payment terms (days)">
            <input
              className={narrow}
              inputMode="numeric"
              disabled={!canEdit}
              defaultValue={current.payment.paymentTermsDays}
              onBlur={(e) =>
                set("payment", {
                  paymentTermsDays: Math.max(0, Number(e.target.value) || 0),
                })
              }
            />
          </Labelled>
          <Labelled label="Late payment fee" help="Blank means none.">
            <input
              className={narrow}
              inputMode="decimal"
              placeholder="None"
              disabled={!canEdit}
              defaultValue={toDollars(current.payment.latePaymentFeeCents)}
              onBlur={(e) =>
                set("payment", { latePaymentFeeCents: money(e.target.value) })
              }
            />
          </Labelled>
        </div>
        <Toggle
          label="Bill in advance"
          checked={current.payment.billInAdvance}
          disabled={!canEdit}
          onChange={(v) => set("payment", { billInAdvance: v })}
        />
        <Toggle
          label="Fees include GST"
          help="OSHC is generally GST-free — leave off unless you're told otherwise."
          checked={current.payment.feesIncludeGst}
          disabled={!canEdit}
          onChange={(v) => set("payment", { feesIncludeGst: v })}
        />
      </Section>

      {/* ── Notes ───────────────────────────────────────────────── */}
      <div>
        <label className="block text-xs font-medium text-muted mb-1">
          Notes for families
        </label>
        <textarea
          className={field}
          rows={2}
          maxLength={2000}
          disabled={!canEdit}
          placeholder="e.g. Fees are reviewed each January. Sibling discounts applied at enrolment."
          defaultValue={current.notes ?? ""}
          onBlur={(e) =>
            setDraft({ ...current, notes: e.target.value.trim() || undefined })
          }
        />
      </div>

      {canEdit && dirty && (
        <div className="flex gap-2">
          <Button
            onClick={() => save.mutate(current as FeePolicy)}
            disabled={save.isPending}
          >
            {save.isPending ? "Saving…" : "Save fee policy"}
          </Button>
          <Button variant="secondary" onClick={discardDraft}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

/* ── Presentation helpers ─────────────────────────────────────── */

function Section({
  icon: Icon,
  title,
  summary,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-border pt-4 space-y-3 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-sm font-medium text-foreground flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 text-muted" />
          {title}
        </h4>
        <span className="text-2xs text-muted text-right">{summary}</span>
      </div>
      {children}
    </div>
  );
}

function Labelled({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted mb-1">
        {label}
      </label>
      {children}
      {help && <p className="text-2xs text-muted mt-1">{help}</p>}
    </div>
  );
}

function Toggle({
  label,
  help,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  help?: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand"
      />
      <span className="text-sm text-foreground">
        {label}
        {help && <span className="block text-xs text-muted">{help}</span>}
      </span>
    </label>
  );
}

/** 0–100, tolerant of an empty or junk box. */
function clampPercent(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A one-line summary, worked out through the same function that does the
 * charging — so the headline can't drift from what a family is actually
 * billed. The worked example is 20 minutes late, which is the case staff
 * ask about.
 */
function describeLateFee(p: ResolvedPolicy["lateCollection"]): string {
  const example = calculateLateFeeCents(p, 20);
  const rate = formatCents(p.amountCents);
  const basis =
    p.basis === "flat"
      ? "flat"
      : p.basis === "per_minute"
        ? "per minute"
        : `per ${p.blockMinutes} min`;
  const grace = p.graceMinutes ? `, ${p.graceMinutes} min grace` : "";
  return `${rate} ${basis}${grace} · 20 min late = ${formatCents(example)}`;
}

function describeAbsence(
  mode: "full" | "none" | "percent",
  percent: number,
): string {
  if (mode === "none") return "no charge";
  if (mode === "percent") return `${percent}%`;
  return "full fee";
}

function describeOnboarding(o: ResolvedPolicy["onboarding"]): string {
  const parts: string[] = [];
  if (o.enrolmentFeeCents !== undefined) {
    parts.push(
      `${formatCents(o.enrolmentFeeCents)} enrolment${
        o.enrolmentFeePerChild ? " per child" : ""
      }`,
    );
  }
  if (o.bondCents !== undefined) parts.push(`${formatCents(o.bondCents)} bond`);
  if (o.annualAdminFeeCents !== undefined) {
    parts.push(`${formatCents(o.annualAdminFeeCents)} admin`);
  }
  return parts.length ? parts.join(" · ") : "None";
}
