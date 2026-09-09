import { requirePageSession } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import { RosterCommandCentre } from "@/components/roster/RosterCommandCentre";

/**
 * Roles that may open the all-centres roster command centre. Deliberately
 * excludes staff / marketing / EOS roles — educators live on /roster/me,
 * and the EOS roles have no rostering duties. Members are auto-scoped to
 * their own centre server-side (`getCentreScope` inside GET /api/services).
 */
const ROSTER_ROLES = new Set(["owner", "head_office", "admin", "member"]);

export default async function RosterPage() {
  const session = await requirePageSession();
  const role = session.user.role ?? "";

  if (!ROSTER_ROLES.has(role)) {
    logger.warn("Roster command centre access denied", {
      userId: session.user.id,
      role,
    });
    return (
      <div className="p-6">
        <div className="max-w-md mx-auto text-center">
          <h1 className="text-lg font-semibold text-foreground">Access denied</h1>
          <p className="text-sm text-muted mt-2">
            You don&apos;t have permission to view the roster command centre.
          </p>
        </div>
      </div>
    );
  }

  const serviceId =
    (session.user as { serviceId?: string | null }).serviceId ?? null;

  return (
    <RosterCommandCentre
      defaultExpandedServiceId={role === "member" ? serviceId : null}
    />
  );
}
