"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  Stethoscope,
  Phone,
  Pill,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import {
  useParentChildren,
  useChildAttendance,
  type ParentChild,
  type AttendanceDay,
} from "@/hooks/useParentPortal";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

type Tab = "attendance" | "medical" | "contacts";

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "attendance", label: "Attendance", icon: CalendarDays },
  { key: "medical", label: "Medical", icon: Stethoscope },
  { key: "contacts", label: "Contacts", icon: Phone },
];

export default function ChildDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<Tab>("attendance");

  const { data: children, isLoading: childrenLoading } = useParentChildren();
  const { data: attendance, isLoading: attendanceLoading } =
    useChildAttendance(id);

  const child = children?.find((c) => c.id === id);

  if (childrenLoading) {
    return <DetailSkeleton />;
  }

  if (!child) {
    return (
      <div className="space-y-4">
        <Link
          href="/parent/children"
          className="inline-flex items-center gap-1 text-sm text-[#004E64] hover:text-[#0A7E9E] font-medium transition-colors min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to children
        </Link>
        <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-[#e8e4df]">
          <p className="text-[#7c7c8a] text-sm">Child not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Back */}
      <Link
        href="/parent/children"
        className="inline-flex items-center gap-1 text-sm text-[#004E64] hover:text-[#0A7E9E] font-medium transition-colors min-h-[44px]"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to children
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#1a1a2e]">
          {child.firstName} {child.lastName}
        </h1>
        <div className="flex items-center gap-2 mt-1">
          {child.yearLevel && (
            <span className="text-sm text-[#7c7c8a]">{child.yearLevel}</span>
          )}
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#004E64]/10 text-[#004E64] text-xs font-medium">
            {child.serviceName}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#F2EDE8] rounded-xl p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all min-h-[44px]",
              activeTab === tab.key
                ? "bg-white text-[#004E64] shadow-sm"
                : "text-[#7c7c8a] hover:text-[#1a1a2e]"
            )}
          >
            <tab.icon className="w-4 h-4" />
            <span className="hidden xs:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "attendance" && (
        <AttendanceTab
          attendance={attendance ?? []}
          loading={attendanceLoading}
        />
      )}
      {activeTab === "medical" && <MedicalTab child={child} />}
      {activeTab === "contacts" && <ContactsTab child={child} />}
    </div>
  );
}

// ── Attendance Tab ───────────────────────────────────────

function AttendanceTab({
  attendance,
  loading,
}: {
  attendance: AttendanceDay[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (attendance.length === 0) {
    return (
      <div className="bg-white rounded-xl p-6 text-center shadow-sm border border-[#e8e4df]">
        <CalendarDays className="w-8 h-8 text-[#7c7c8a] mx-auto mb-2" />
        <p className="text-[#7c7c8a] text-sm">
          No attendance records found for the last 30 days.
        </p>
      </div>
    );
  }

  // Group by week (Mon-Fri rows)
  const weeks = groupByWeek(attendance);

  return (
    <div className="space-y-4">
      <p className="text-xs text-[#7c7c8a]">Last 30 days</p>

      {/* Day headers */}
      <div className="grid grid-cols-5 gap-1 text-center">
        {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => (
          <span
            key={d}
            className="text-[10px] font-semibold text-[#7c7c8a] uppercase"
          >
            {d}
          </span>
        ))}
      </div>

      {/* Weeks */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-5 gap-1">
          {week.map((day, di) => (
            <div
              key={di}
              className={cn(
                "aspect-square rounded-lg flex flex-col items-center justify-center text-[10px]",
                day === null
                  ? "bg-transparent"
                  : day.status === "present"
                    ? "bg-green-100 text-green-700"
                    : day.status === "absent"
                      ? "bg-red-100 text-red-600"
                      : "bg-[#F2EDE8] text-[#7c7c8a]"
              )}
            >
              {day && (
                <>
                  <span className="font-medium">
                    {new Date(day.date).getDate()}
                  </span>
                  <span className="text-[8px]">
                    {day.status === "present"
                      ? "Present"
                      : day.status === "absent"
                        ? "Absent"
                        : "No session"}
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      ))}

      {/* Legend */}
      <div className="flex items-center gap-4 justify-center pt-2">
        <LegendDot color="bg-green-500" label="Present" />
        <LegendDot color="bg-red-500" label="Absent" />
        <LegendDot color="bg-[#e8e4df]" label="No session" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-[10px] text-[#7c7c8a]">
      <span className={cn("w-2 h-2 rounded-full", color)} />
      {label}
    </span>
  );
}

/** Group attendance days into Mon-Fri weeks */
function groupByWeek(
  days: AttendanceDay[]
): (AttendanceDay | null)[][] {
  if (days.length === 0) return [];

  // Sort ascending
  const sorted = [...days].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const weeks: (AttendanceDay | null)[][] = [];
  let currentWeek: (AttendanceDay | null)[] = [];

  for (const day of sorted) {
    const date = new Date(day.date);
    const dow = date.getDay(); // 0=Sun, 1=Mon...5=Fri, 6=Sat
    if (dow === 0 || dow === 6) continue; // Skip weekends

    const slotIndex = dow - 1; // Mon=0, Fri=4

    // If slotIndex <= last filled slot, start new week
    if (currentWeek.length > slotIndex) {
      // Pad remaining days
      while (currentWeek.length < 5) currentWeek.push(null);
      weeks.push(currentWeek);
      currentWeek = [];
    }

    // Pad gaps (e.g. if Wed but Mon/Tue missing)
    while (currentWeek.length < slotIndex) currentWeek.push(null);
    currentWeek.push(day);
  }

  // Push last week
  if (currentWeek.length > 0) {
    while (currentWeek.length < 5) currentWeek.push(null);
    weeks.push(currentWeek);
  }

  return weeks;
}

// ── Medical Tab ──────────────────────────────────────────

function MedicalTab({ child }: { child: ParentChild }) {
  const hasAny =
    child.medicalConditions.length > 0 ||
    child.allergies.length > 0 ||
    child.medications.length > 0 ||
    child.immunisationStatus;

  if (!hasAny) {
    return (
      <div className="bg-white rounded-xl p-6 text-center shadow-sm border border-[#e8e4df]">
        <Stethoscope className="w-8 h-8 text-[#7c7c8a] mx-auto mb-2" />
        <p className="text-[#7c7c8a] text-sm">
          No medical information on file. Contact your centre to update.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {child.medicalConditions.length > 0 && (
        <InfoCard
          icon={AlertTriangle}
          iconColor="text-amber-600"
          title="Medical Conditions"
          items={child.medicalConditions}
        />
      )}

      {child.allergies.length > 0 && (
        <InfoCard
          icon={AlertTriangle}
          iconColor="text-red-500"
          title="Allergies"
          items={child.allergies}
        />
      )}

      {child.medications.length > 0 && (
        <InfoCard
          icon={Pill}
          iconColor="text-blue-500"
          title="Medications"
          items={child.medications}
        />
      )}

      {child.immunisationStatus && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-[#e8e4df]">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-green-600" />
            <h3 className="text-sm font-heading font-semibold text-[#1a1a2e]">
              Immunisation Status
            </h3>
          </div>
          <p className="text-sm text-[#7c7c8a] ml-6">
            {child.immunisationStatus}
          </p>
        </div>
      )}

      <p className="text-xs text-[#7c7c8a] text-center pt-2">
        To update medical details, please contact your centre.
      </p>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  iconColor,
  title,
  items,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  title: string;
  items: string[];
}) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-[#e8e4df]">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn("w-4 h-4", iconColor)} />
        <h3 className="text-sm font-heading font-semibold text-[#1a1a2e]">
          {title}
        </h3>
      </div>
      <ul className="space-y-1 ml-6">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-[#7c7c8a]">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Contacts Tab ─────────────────────────────────────────

function ContactsTab({ child }: { child: ParentChild }) {
  if (child.emergencyContacts.length === 0) {
    return (
      <div className="bg-white rounded-xl p-6 text-center shadow-sm border border-[#e8e4df]">
        <Phone className="w-8 h-8 text-[#7c7c8a] mx-auto mb-2" />
        <p className="text-[#7c7c8a] text-sm">
          No emergency contacts on file. You can add them in your account
          settings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {child.emergencyContacts.map((contact) => (
        <div
          key={contact.id}
          className="bg-white rounded-xl p-4 shadow-sm border border-[#e8e4df]"
        >
          <h3 className="text-sm font-heading font-semibold text-[#1a1a2e]">
            {contact.name}
          </h3>
          <p className="text-xs text-[#7c7c8a] mt-0.5">
            {contact.relationship}
          </p>
          <a
            href={`tel:${contact.phone}`}
            className="inline-flex items-center gap-1.5 mt-2 text-sm text-[#004E64] hover:text-[#0A7E9E] font-medium transition-colors min-h-[44px]"
          >
            <Phone className="w-4 h-4" />
            {contact.phone}
          </a>
        </div>
      ))}
    </div>
  );
}

// ── Skeleton ─────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-5 w-32" />
      <div>
        <Skeleton className="h-8 w-56 mb-2" />
        <Skeleton className="h-5 w-40" />
      </div>
      <Skeleton className="h-11 w-full rounded-xl" />
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
