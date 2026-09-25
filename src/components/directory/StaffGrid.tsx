"use client";

import { StaffCard, type StaffCardUser } from "./StaffCard";

export interface StaffGridProps {
  staff: StaffCardUser[];
  showRole: boolean;
  showEmail: boolean;
  /** Whether the viewer's role can open other people's /staff/[id]
   *  profiles. Self cards are always linked regardless. */
  canOpenProfiles: boolean;
  /** The viewer's own user id — their card stays linked even when
   *  canOpenProfiles is false. */
  viewerId?: string;
}

export function StaffGrid({
  staff,
  showRole,
  showEmail,
  canOpenProfiles,
  viewerId,
}: StaffGridProps) {
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
          canOpenProfile={canOpenProfiles || user.id === viewerId}
        />
      ))}
    </div>
  );
}
