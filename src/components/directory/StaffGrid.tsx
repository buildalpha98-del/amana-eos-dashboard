"use client";

import { StaffCard, type StaffCardUser } from "./StaffCard";

export interface StaffGridProps {
  staff: StaffCardUser[];
  showRole: boolean;
  showEmail: boolean;
}

export function StaffGrid({ staff, showRole, showEmail }: StaffGridProps) {
  if (staff.length === 0) {
    return (
      <div className="text-center py-12 text-muted text-sm">
        No staff match your filters
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {staff.map((user) => (
        <StaffCard
          key={user.id}
          user={user}
          showRole={showRole}
          showEmail={showEmail}
        />
      ))}
    </div>
  );
}
