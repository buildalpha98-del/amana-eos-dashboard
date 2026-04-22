"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  AlertTriangle,
  UtensilsCrossed,
  Users,
  Star,
  Mail,
  Phone,
} from "lucide-react";
import {
  useChildren,
  deriveFilterOptions,
  type ChildRecord,
  type ChildrenFilters as ChildrenFiltersType,
} from "@/hooks/useChildren";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ChildrenFilters } from "@/components/services/ChildrenFilters";

interface ServiceChildrenTabProps {
  serviceId: string;
  serviceName?: string;
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  withdrawn: "bg-red-100 text-red-700",
};

const CCS_BADGE_STYLES: Record<string, string> = {
  eligible: "bg-green-100 text-green-700 border-green-200",
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  ineligible: "bg-red-100 text-red-700 border-red-200",
};

const SESSION_LABELS: Record<string, string> = {
  bsc: "BSC",
  asc: "ASC",
  vc: "VC",
};

const DAY_SHORT: Record<string, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
};

function getAge(dob: string | null): string {
  if (!dob) return "";
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())
  ) {
    age--;
  }
  return `${age}y`;
}

function hasMedicalFlags(medical: Record<string, unknown> | null): boolean {
  if (!medical) return false;
  const conditions = medical.conditions ?? medical.medicalConditions ?? [];
  const allergies = medical.allergies;
  const anaphylaxis = medical.anaphylaxisRisk;
  return (
    (Array.isArray(conditions) && conditions.length > 0) ||
    !!allergies ||
    !!anaphylaxis
  );
}

function hasDietaryFlags(dietary: Record<string, unknown> | null): boolean {
  if (!dietary) return false;
  const restrictions = dietary.restrictions ?? dietary.dietaryRequirements ?? dietary.details;
  if (typeof restrictions === "string" && restrictions.trim().length > 0) return true;
  return Array.isArray(restrictions) && restrictions.length > 0;
}

interface BookingPrefsShape {
  days?: Record<string, string[]>;
  bookingType?: string;
  sessionTypes?: string[];
}

function renderEnrolledDays(bookingPrefs: Record<string, unknown> | null): React.ReactNode {
  if (!bookingPrefs) return <span className="text-muted text-xs">Not set</span>;
  const bp = bookingPrefs as unknown as BookingPrefsShape;
  const days = bp.days;
  if (!days || typeof days !== "object") return <span className="text-muted text-xs">Not set</span>;

  return (
    <div className="flex flex-wrap gap-1">
      {Object.entries(days).map(([session, dayNames]) => {
        if (!Array.isArray(dayNames) || dayNames.length === 0) return null;
        return (
          <span
            key={session}
            className="text-[10px] font-medium bg-brand/10 text-brand px-1.5 py-0.5 rounded"
          >
            {SESSION_LABELS[session] ?? session.toUpperCase()}:{" "}
            {dayNames.map((d) => DAY_SHORT[d] ?? d).join(", ")}
          </span>
        );
      })}
    </div>
  );
}

export function ServiceChildrenTab({ serviceId }: ServiceChildrenTabProps) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ChildrenFiltersType>({
    serviceId,
    status: "current",
    includeParents: true,
  });

  const { data, isLoading, error } = useChildren({
    ...filters,
    search: search.trim() || undefined,
  });

  const children = useMemo(() => data?.children ?? [], [data?.children]);

  // Derive option lists from the live result set. `deriveFilterOptions`
  // considers Child.room / Child.ccsStatus / Child.tags only — the API
  // filter added in Commit 2 matches on Child.room (not ownaRoomName),
  // so surfacing OWNA-only rooms would produce empty result sets.
  const options = useMemo(() => deriveFilterOptions(children), [children]);

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-foreground bg-card text-sm focus:ring-2 focus:ring-brand focus:border-transparent"
          />
        </div>
      </div>

      {/* Filters */}
      <ChildrenFilters
        filters={filters}
        onChange={setFilters}
        roomOptions={options.roomOptions}
        ccsStatusOptions={options.ccsStatusOptions}
        tagOptions={options.tagOptions}
      />

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState error={error} />
      ) : children.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No children found"
          description={
            search
              ? "No children match your search."
              : "No children are enrolled at this service."
          }
        />
      ) : (
        <div className="space-y-2">
          {children.map((child) => (
            <ChildRow key={child.id} child={child} />
          ))}
        </div>
      )}
    </div>
  );
}

function CcsBadge({ status }: { status: string }) {
  const normalised = status.toLowerCase();
  const styles =
    CCS_BADGE_STYLES[normalised] ?? "bg-gray-100 text-gray-700 border-gray-200";
  return (
    <span
      data-testid="ccs-badge"
      className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full border capitalize ${styles}`}
    >
      CCS: {status}
    </span>
  );
}

function ChildRow({ child }: { child: ChildRecord }) {
  const medical = hasMedicalFlags(child.medical);
  const dietary = hasDietaryFlags(child.dietary);
  const bp = child.bookingPrefs as Record<string, unknown> | null;
  const bookingType = (bp as BookingPrefsShape | null)?.bookingType;
  const parents = child.parents ?? [];

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-2">
      {/* Row 1: Name (link), badges, status */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/children/${child.id}`}
            className="font-semibold text-foreground hover:text-brand hover:underline"
          >
            {child.firstName} {child.surname}
          </Link>
          {child.dob && (
            <span className="text-xs text-muted">{getAge(child.dob)}</span>
          )}
          {medical && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 text-[10px] font-semibold">
              <AlertTriangle className="w-3 h-3" />
              Medical
            </span>
          )}
          {dietary && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 text-[10px] font-semibold">
              <UtensilsCrossed className="w-3 h-3" />
              Dietary
            </span>
          )}
          {bookingType && (
            <span className="text-[10px] font-medium bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full capitalize">
              {bookingType}
            </span>
          )}
          {child.ccsStatus && <CcsBadge status={child.ccsStatus} />}
        </div>
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${
            STATUS_STYLES[child.status] ?? "bg-gray-100 text-gray-700"
          }`}
        >
          {child.status}
        </span>
      </div>

      {/* Row 2: Parents / Carers with primary-star and click-to-action links */}
      {parents.length > 0 ? (
        <ul
          className="flex flex-col gap-1 text-xs text-muted"
          aria-label="Parents and carers"
        >
          {parents.map((parent, idx) => (
            <li
              key={`${parent.firstName}-${parent.surname}-${idx}`}
              className="flex items-center gap-2 flex-wrap"
            >
              {parent.isPrimary && (
                <Star
                  className="w-3 h-3 text-amber-500 fill-amber-500"
                  aria-label="Primary contact"
                />
              )}
              <span className="font-medium text-foreground">
                {parent.firstName} {parent.surname}
              </span>
              {parent.relationship && (
                <span className="text-muted">· {parent.relationship}</span>
              )}
              {parent.phone && (
                <a
                  href={`tel:${parent.phone}`}
                  className="inline-flex items-center gap-1 text-brand hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Phone className="w-3 h-3" />
                  {parent.phone}
                </a>
              )}
              {parent.email && (
                <a
                  href={`mailto:${parent.email}`}
                  className="inline-flex items-center gap-1 text-brand hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Mail className="w-3 h-3" />
                  {parent.email}
                </a>
              )}
            </li>
          ))}
        </ul>
      ) : (
        (() => {
          // Fallback when the API didn't hydrate parents: render the legacy
          // single-line "primary parent" summary from the enrolment.
          const pp = child.enrolment?.primaryParent;
          if (!pp) return null;
          return (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs text-muted">
              <span className="flex items-center gap-1">
                <Phone className="w-3 h-3" />
                {pp.firstName} {pp.surname}
                {pp.mobile && ` · ${pp.mobile}`}
              </span>
            </div>
          );
        })()
      )}

      {/* Row 3: School + enrolled days */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs text-muted">
        {child.schoolName && (
          <span>
            {child.schoolName}
            {child.yearLevel && ` · ${child.yearLevel}`}
          </span>
        )}
        <div>{renderEnrolledDays(bp)}</div>
      </div>
    </div>
  );
}
