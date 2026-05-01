import { ApiError } from "@/lib/api-error";

/**
 * Service-scoping guard for audit mutations (POST + PATCH + responses
 * PATCH). When the actor is a Director of Service (member), they can only
 * create / modify audits for the service they're assigned to. Org-wide
 * roles (owner, head_office, admin) bypass entirely.
 *
 * 2026-05-01: extracted from `[id]/route.ts` so POST `/api/audits` could
 * reuse it. Previously the body's `serviceId` was unchecked on POST,
 * letting a member at service A create audits for service B by sending
 * `serviceId: "B"` in the request body — surfaced while rewriting the
 * skipped coordinator-collapse tests in PR #43.
 */
export function ensureCoordCanTouchAudit(
  role: string,
  userServiceId: string | null | undefined,
  auditServiceId: string,
) {
  if (role !== "member") return;
  if (!userServiceId || userServiceId !== auditServiceId) {
    throw ApiError.forbidden(
      "Coordinators can only work on audits for their own service.",
    );
  }
}
