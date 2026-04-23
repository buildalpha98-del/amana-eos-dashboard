"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useParentChildren, type ParentChild } from "@/hooks/useParentPortal";
import { KidPill, SectionLabel } from "@/components/parent/ui";
import { Skeleton } from "@/components/ui/Skeleton";

export default function ChildrenListPage() {
  const { data: children, isLoading, error } = useParentChildren();

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-heading font-bold text-[color:var(--color-foreground)] leading-tight">
            Your Children
          </h1>
          <p className="text-sm text-[color:var(--color-muted)] mt-1">
            Tap a child to see attendance, medical info, and contacts.
          </p>
        </div>
        <Link
          href="/parent/children/new"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[color:var(--color-brand)] text-white text-sm font-semibold rounded-full min-h-[44px] shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Enrol sibling</span>
          <span className="sm:hidden">Enrol</span>
        </Link>
      </div>

      {isLoading ? (
        <ChildrenSkeleton />
      ) : error || !children ? (
        <div className="warm-card text-center py-8">
          <p className="text-sm text-[color:var(--color-muted)]">
            Couldn&apos;t load children. Please try again.
          </p>
        </div>
      ) : children.length === 0 ? (
        <div className="warm-card text-center py-10">
          <p className="text-sm text-[color:var(--color-muted)]">
            No children linked yet. Contact your centre if this looks wrong.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          <SectionLabel label={`${children.length} ${children.length === 1 ? "child" : "children"}`} />
          {children.map((child) => (
            <KidPill
              key={child.id}
              child={{
                id: child.id,
                name: `${child.firstName} ${child.lastName}`,
                subtitle: buildSubtitle(child),
              }}
              href={`/parent/children/${child.id}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function buildSubtitle(child: ParentChild): string {
  const bits: string[] = [];
  if (child.yearLevel) bits.push(child.yearLevel);
  if (child.serviceName) bits.push(child.serviceName);
  if (child.attendanceThisWeek) {
    bits.push(
      `${child.attendanceThisWeek.attended}/${child.attendanceThisWeek.total} this week`,
    );
  }
  return bits.join(" · ");
}

function ChildrenSkeleton() {
  return (
    <div className="space-y-2.5">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-20 rounded-[var(--radius-lg)]" />
      ))}
    </div>
  );
}
