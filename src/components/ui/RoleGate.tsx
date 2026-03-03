"use client";

import { useSession } from "next-auth/react";
import type { Role } from "@prisma/client";
import { hasMinRole, hasFeature, type Feature } from "@/lib/role-permissions";

interface RoleGateProps {
  /** Minimum role required to render the children. */
  role?: Role;
  /** Alternatively, require a specific feature/capability. */
  feature?: Feature;
  /**
   * Optional fallback rendered when the user lacks access.
   * Defaults to rendering nothing.
   */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Conditionally renders its children based on the current user's role.
 *
 * Usage:
 * ```tsx
 * <RoleGate role="admin">
 *   <SensitiveSection />
 * </RoleGate>
 *
 * <RoleGate feature="financials.view">
 *   <FinancialChart />
 * </RoleGate>
 *
 * <RoleGate role="owner" fallback={<p>You do not have access.</p>}>
 *   <OwnerPanel />
 * </RoleGate>
 * ```
 */
export function RoleGate({
  role,
  feature,
  fallback = null,
  children,
}: RoleGateProps) {
  const { data: session } = useSession();
  const userRole = session?.user?.role as Role | undefined;

  // While session is loading, render nothing (prevents flash)
  if (!session) return null;

  // Check role-based access
  if (role && !hasMinRole(userRole, role)) {
    return <>{fallback}</>;
  }

  // Check feature-based access
  if (feature && !hasFeature(userRole, feature)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

/**
 * Server-side equivalent: use in Server Components / route handlers.
 * Returns true if the role is sufficient.
 */
export function checkRoleAccess(
  userRole: Role | undefined,
  requiredRole?: Role,
  requiredFeature?: Feature
): boolean {
  if (requiredRole && !hasMinRole(userRole, requiredRole)) return false;
  if (requiredFeature && !hasFeature(userRole, requiredFeature)) return false;
  return true;
}
