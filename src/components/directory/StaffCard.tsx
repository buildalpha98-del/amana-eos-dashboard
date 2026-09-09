"use client";

import Link from "next/link";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { RoleBadge } from "@/components/staff/RoleBadge";
import type { Role } from "@prisma/client";

export interface StaffCardUser {
  id: string;
  name: string;
  avatar?: string | null;
  role: Role;
  email?: string;
  service?: { name: string } | null;
}

export interface StaffCardProps {
  user: StaffCardUser;
  /** Show the RoleBadge (admin + coordinator viewers) */
  showRole: boolean;
  /** Show the email row (admin viewers only) */
  showEmail: boolean;
  /** Link the card to /staff/[id]. False for viewers whose role can't open
   *  other people's profiles (staff/marketing get Access-denied there —
   *  mirrors the guard EmployeeRow applies). Self cards stay linked. */
  canOpenProfile: boolean;
}

export function StaffCard({ user, showRole, showEmail, canOpenProfile }: StaffCardProps) {
  const cardClassName =
    "border border-border rounded-lg p-4 bg-card flex flex-col items-center text-center";

  const content = (
    <>
      <StaffAvatar user={user} size="lg" className="mb-3" />
      <div className="font-medium text-foreground truncate w-full">{user.name}</div>
      {showRole && <RoleBadge role={user.role} className="mt-1" />}
      {user.service?.name && (
        <div className="text-xs text-muted mt-1 truncate w-full">{user.service.name}</div>
      )}
      {showEmail && user.email && (
        <div className="text-xs text-muted/70 mt-1 truncate max-w-full">{user.email}</div>
      )}
    </>
  );

  if (!canOpenProfile) {
    return <div className={cardClassName}>{content}</div>;
  }

  return (
    <Link
      href={`/staff/${user.id}`}
      className={`${cardClassName} hover:shadow-md transition`}
    >
      {content}
    </Link>
  );
}
