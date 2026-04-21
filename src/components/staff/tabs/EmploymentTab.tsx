import type { User, Service, EmploymentContract } from "@prisma/client";
import Link from "next/link";
import { RoleBadge } from "@/components/staff/RoleBadge";
import { Briefcase, Building2, CalendarDays, BadgeCheck } from "lucide-react";

interface EmploymentTabProps {
  targetUser: User & { service?: Service | null };
  latestContract: EmploymentContract | null;
  canEdit: boolean;
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function EmploymentTab({ targetUser, latestContract, canEdit }: EmploymentTabProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Employment details</h3>
          {canEdit && (
            <button
              type="button"
              disabled
              title="Editing lands in a future chunk"
              className="text-sm text-muted hover:text-foreground px-3 py-1 rounded-md border border-border opacity-60 cursor-not-allowed"
            >
              Edit
            </button>
          )}
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5" />
              Role
            </dt>
            <dd className="mt-1">
              <RoleBadge role={targetUser.role} />
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" />
              Service
            </dt>
            <dd className="mt-0.5 text-sm text-foreground">
              {targetUser.service?.name ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              Start date
            </dt>
            <dd className="mt-0.5 text-sm text-foreground">
              {formatDate(targetUser.startDate)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5" />
              Employment type
            </dt>
            <dd className="mt-0.5 text-sm text-foreground">
              {humanize(targetUser.employmentType)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <BadgeCheck className="w-5 h-5 text-brand" />
            Latest contract
          </h3>
          {latestContract && (
            <Link
              href={`/contracts/${latestContract.id}`}
              className="text-sm text-brand hover:underline"
            >
              View in Contracts
            </Link>
          )}
        </div>
        {!latestContract ? (
          <p className="text-sm text-muted">No contract on file.</p>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Type</dt>
              <dd className="mt-0.5 text-sm text-foreground">
                {humanize(latestContract.contractType)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Status</dt>
              <dd className="mt-0.5 text-sm text-foreground">
                {humanize(latestContract.status)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Pay rate</dt>
              <dd className="mt-0.5 text-sm text-foreground">
                {formatCurrency(latestContract.payRate)}
                {latestContract.hoursPerWeek
                  ? ` · ${latestContract.hoursPerWeek} hrs/wk`
                  : ""}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Award level</dt>
              <dd className="mt-0.5 text-sm text-foreground">
                {humanize(latestContract.awardLevel) || latestContract.awardLevelCustom || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Start</dt>
              <dd className="mt-0.5 text-sm text-foreground">
                {formatDate(latestContract.startDate)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">End</dt>
              <dd className="mt-0.5 text-sm text-foreground">
                {formatDate(latestContract.endDate)}
              </dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}
